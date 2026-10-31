"""The vault: Markdown files as the source of truth, SQLite as a rebuildable index.

Layout (inside the vault folder):
  entries/YYYY/YYYY-MM-DD-<id>.md   one file per entry; the card is YAML front matter, the body is the text
  threads/<id>.md                   thinking threads (front matter = data, body = readable transcript)
  reviews/<key>.md                  weekly and monthly reviews
  headsup/<key>.md                  daily interpretations
  goals/<id>.json, insights/<key>.json, settings.json
  assets/<id>.<ext>                 images attached to entries
  trash/<collection>/...            files removed with "Delete forever" (never actually deleted by the app)
  backups/sb-YYYYMMDD-HHMMSS.zip    automatic snapshots
  .index.sqlite                     the index; safe to delete, it is rebuilt from the files
"""
from __future__ import annotations
import datetime as dt, json, os, re, shutil, sqlite3, threading
from pathlib import Path
from typing import Callable, Iterable
import yaml

MD = {"entries", "threads", "digests", "headsup"}
JSONC = {"goals", "insights", "settings"}
COLLECTIONS = MD | JSONC
DIRS = {"entries": "entries", "threads": "threads", "digests": "reviews", "headsup": "headsup", "goals": "goals", "insights": "insights"}
SAFE_ID = re.compile(r"^[A-Za-z0-9_\-.~:@+]{1,200}$")
FM = re.compile(r"^---\n(.*?)\n---\n?(.*)$", re.S)

VAULT_README = """# Second Brain vault

This folder is the whole brain. Every entry is a Markdown file under `entries/`, with the card
(type, mood, themes, people, tasks, links, ...) in the YAML header and your text as the body.
Reviews, thinking threads and daily readings are Markdown too. `goals/`, `insights/` and
`settings.json` are small JSON files. `assets/` holds attached images. Nothing here is deleted by
the app: "Delete forever" moves files into `trash/`. `backups/` holds automatic zip snapshots.
`.index.sqlite` is a search index and can be deleted at any time; it is rebuilt from the files.
The folder opens in Obsidian or any editor. Keep it somewhere that is itself backed up.
"""

def _clean(v):
    """YAML may hand back dates for unquoted values edited by hand; keep everything JSON-friendly."""
    if isinstance(v, (dt.datetime, dt.date)):
        return v.isoformat()
    if isinstance(v, dict):
        return {k: _clean(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_clean(x) for x in v]
    return v

def _dump_yaml(d: dict) -> str:
    return yaml.safe_dump(d, sort_keys=False, allow_unicode=True, default_flow_style=False, width=1000)

class Vault:
    def __init__(self, root: Path | str):
        self.root = Path(root).expanduser()
        self.lock = threading.RLock()
        self.listeners: list[Callable[[dict], None]] = []
        for d in ["entries", "threads", "reviews", "headsup", "goals", "insights", "assets", "trash", "backups", "exports"]:
            (self.root / d).mkdir(parents=True, exist_ok=True)
        readme = self.root / "README.md"
        if not readme.exists():
            readme.write_text(VAULT_README)
        self.db = sqlite3.connect(str(self.root / ".index.sqlite"), check_same_thread=False)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("CREATE TABLE IF NOT EXISTS docs (coll TEXT, id TEXT, json TEXT, ts INTEGER, key TEXT, deleted INTEGER DEFAULT 0, PRIMARY KEY (coll, id))")
        try:
            self.db.execute("CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(id UNINDEXED, title, text, themes)")
            self.fts = True
        except sqlite3.OperationalError:
            self.fts = False
        n = self._q("SELECT COUNT(*) FROM docs")[0][0]
        if n == 0 and any(self._files()):
            self.reindex()

    # ── paths ──
    def path_for(self, coll: str, id: str, doc: dict | None = None) -> Path:
        if coll == "settings":
            return self.root / "settings.json"
        if coll == "entries":
            date = (doc or {}).get("date") or self._existing_entry_date(id) or dt.date.today().isoformat()
            return self.root / "entries" / date[:4] / f"{date}-{id}.md"
        ext = ".md" if coll in MD else ".json"
        return self.root / DIRS[coll] / f"{id}{ext}"

    def _q(self, sql: str, params: tuple = ()):
        with self.lock:
            return self.db.execute(sql, params).fetchall()

    def _existing_entry_date(self, id: str) -> str | None:
        rows = self._q("SELECT json FROM docs WHERE coll='entries' AND id=?", (id,))
        if rows:
            try:
                return json.loads(rows[0][0]).get("date")
            except Exception:
                return None
        return None

    def _files(self) -> Iterable[tuple[str, Path]]:
        for p in (self.root / "entries").rglob("*.md"):
            yield "entries", p
        for coll, d in DIRS.items():
            if coll == "entries":
                continue
            for p in (self.root / d).glob("*.md" if coll in MD else "*.json"):
                yield coll, p
        if (self.root / "settings.json").exists():
            yield "settings", self.root / "settings.json"

    # ── (de)serialisation ──
    def _serialize(self, coll: str, doc: dict) -> str:
        if coll in JSONC:
            return json.dumps(doc, indent=2, ensure_ascii=False)
        if coll == "entries":
            head = {k: v for k, v in doc.items() if k != "text"}
            return f"---\n{_dump_yaml(head)}---\n{doc.get('text', '')}\n"
        return f"---\n{_dump_yaml(doc)}---\n{self._render_body(coll, doc)}\n"

    def _render_body(self, coll: str, d: dict) -> str:
        if coll == "threads":
            lines = [f"# {d.get('title') or d.get('problem', '')}", "", d.get("problem", ""), ""]
            for s in d.get("steps", []):
                who = "Claude" if s.get("role") == "claude" else "Me"
                lines.append(f"- **{who}**: {s.get('text', '')}")
            o = d.get("outcome")
            if o:
                lines += ["", f"**Decision:** {o.get('decision', '')}", f"**Next step:** {o.get('nextStep', '')}", "", o.get("summary", "")]
            return "\n".join(lines)
        data = d.get("data") or {}
        if coll in ("digests", "headsup"):
            lines = [f"# {data.get('headline') or data.get('state', '')[:60] or d.get('key', '')}", ""]
            if data.get("narrative"):
                lines += [data["narrative"], ""]
            if data.get("state"):
                lines += [data["state"], ""]
            for sec in ("wins", "struggles", "patterns", "suggestions", "blind_spots"):
                items = data.get(sec) or []
                if items:
                    lines += [f"## {sec.replace('_', ' ').title()}"] + [f"- {x if isinstance(x, str) else x.get('text', '')}" for x in items] + [""]
            if data.get("question"):
                lines += [f"> {data['question']}"]
            return "\n".join(lines)
        return ""

    def _parse(self, coll: str, path: Path) -> dict | None:
        raw = path.read_text(encoding="utf-8")
        if coll in JSONC:
            d = json.loads(raw)
        else:
            m = FM.match(raw)
            if not m:
                return None
            d = _clean(yaml.safe_load(m.group(1)) or {})
            if coll == "entries":
                d["text"] = m.group(2).rstrip("\n")
        if not isinstance(d, dict):
            return None
        if coll == "settings":
            d.setdefault("id", "main")
        if coll in ("digests", "headsup", "insights") and "key" in d and "id" not in d:
            d["id"] = d["key"]
        return d if d.get("id") else None

    # ── index ──
    def _index_put(self, coll: str, doc: dict):
        ts = doc.get("ts") if isinstance(doc.get("ts"), (int, float)) else None
        key = doc.get("key") or doc.get("updatedAt") or ""
        self.db.execute("INSERT OR REPLACE INTO docs (coll, id, json, ts, key, deleted) VALUES (?,?,?,?,?,?)", (coll, doc["id"], json.dumps(doc, ensure_ascii=False), ts, key, 1 if doc.get("deleted") else 0))
        if coll == "entries" and self.fts:
            self.db.execute("DELETE FROM entries_fts WHERE id=?", (doc["id"],))
            self.db.execute("INSERT INTO entries_fts (id, title, text, themes) VALUES (?,?,?,?)", (doc["id"], doc.get("title") or "", doc.get("text") or "", " ".join(doc.get("themes") or [])))

    def reindex(self) -> dict:
        with self.lock:
            self.db.execute("DELETE FROM docs")
            if self.fts:
                self.db.execute("DELETE FROM entries_fts")
            counts: dict[str, int] = {}
            for coll, p in self._files():
                try:
                    d = self._parse(coll, p)
                except Exception:
                    d = None
                if d:
                    self._index_put(coll, d)
                    counts[coll] = counts.get(coll, 0) + 1
            self.db.commit()
            return counts

    # ── public API ──
    def list(self, coll: str) -> list[dict]:
        if coll not in COLLECTIONS:
            return []
        order = "ts DESC" if coll == "entries" else "key DESC, id DESC"
        rows = self._q(f"SELECT json FROM docs WHERE coll=? ORDER BY {order}", (coll,))
        return [json.loads(r[0]) for r in rows]

    def get(self, coll: str, id: str) -> dict | None:
        rows = self._q("SELECT json FROM docs WHERE coll=? AND id=?", (coll, id))
        return json.loads(rows[0][0]) if rows else None

    def put(self, coll: str, id: str, doc: dict) -> dict:
        if coll not in COLLECTIONS or not SAFE_ID.match(id):
            raise ValueError("bad collection or id")
        if not isinstance(doc, dict):
            raise ValueError("document must be an object")
        doc = dict(doc); doc["id"] = id
        with self.lock:
            old_path = None
            if coll == "entries":
                prev = self.get(coll, id)
                if prev and prev.get("date") != doc.get("date"):
                    old_path = self.path_for(coll, id, prev)
            path = self.path_for(coll, id, doc)
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(path.suffix + ".tmp")
            tmp.write_text(self._serialize(coll, doc), encoding="utf-8")
            os.replace(tmp, path)
            if old_path and old_path.exists() and old_path != path:
                old_path.unlink()
            self._index_put(coll, doc)
            self.db.commit()
        self._emit({"collection": coll, "id": id, "op": "set"})
        return doc

    def delete(self, coll: str, id: str) -> bool:
        """Move the file to trash/<coll>/; the app never unlinks a document."""
        if coll not in COLLECTIONS or not SAFE_ID.match(id):
            raise ValueError("bad collection or id")
        with self.lock:
            doc = self.get(coll, id)
            path = self.path_for(coll, id, doc)
            moved = False
            if path.exists():
                dest = self.root / "trash" / coll / f"{dt.datetime.now().strftime('%Y%m%d-%H%M%S')}-{path.name}"
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(path), str(dest))
                moved = True
            self.db.execute("DELETE FROM docs WHERE coll=? AND id=?", (coll, id))
            if coll == "entries" and self.fts:
                self.db.execute("DELETE FROM entries_fts WHERE id=?", (id,))
            self.db.commit()
        self._emit({"collection": coll, "id": id, "op": "delete"})
        return moved

    def counts(self) -> dict:
        rows = self._q("SELECT coll, SUM(CASE WHEN deleted=1 THEN 0 ELSE 1 END), SUM(deleted) FROM docs GROUP BY coll")
        out = {c: 0 for c in COLLECTIONS}
        trash = 0
        for coll, live, deleted in rows:
            out[coll] = live or 0
            if coll == "entries":
                trash = deleted or 0
        out["trash"] = trash
        return out

    def search(self, q: str, limit: int = 50) -> list[str]:
        if not self.fts or not q.strip():
            return []
        safe = " ".join(f'"{t}"' for t in re.findall(r"\w+", q))
        rows = self._q("SELECT id FROM entries_fts WHERE entries_fts MATCH ? LIMIT ?", (safe, limit))
        return [r[0] for r in rows]

    def merge_import(self, payload: dict) -> dict:
        """Write documents from an export only when they are newer than what is stored; never delete."""
        written = skipped = 0
        def newer(inc: dict, cur: dict | None) -> bool:
            return not cur or not cur.get("updatedAt") or not inc.get("updatedAt") or inc["updatedAt"] > cur["updatedAt"]
        plan = [("goals", payload.get("goals", []), "id"), ("entries", list(payload.get("entries", [])) + list(payload.get("trash", [])), "id"), ("threads", payload.get("threads", []), "id"), ("digests", payload.get("digests", []), "key"), ("insights", payload.get("insights", []), "key"), ("headsup", payload.get("headsup", []), "key")]
        for coll, docs, keyf in plan:
            for d in docs or []:
                if not isinstance(d, dict) or not d.get(keyf):
                    continue
                id = str(d[keyf]); cur = self.get(coll, id)
                if newer(d, cur):
                    self.put(coll, id, d); written += 1
                else:
                    skipped += 1
        if isinstance(payload.get("settings"), dict) and not self.get("settings", "main"):
            self.put("settings", "main", payload["settings"]); written += 1
        return {"written": written, "skipped": skipped}

    def export_payload(self) -> dict:
        entries = self.list("entries")
        return {"app": "second-brain", "version": 2, "exportedAt": dt.datetime.now().astimezone().isoformat(timespec="seconds"), "entries": [e for e in entries if not e.get("deleted")], "trash": [e for e in entries if e.get("deleted")], "goals": self.list("goals"), "threads": self.list("threads"), "digests": self.list("digests"), "insights": self.list("insights"), "headsup": self.list("headsup"), "settings": self.get("settings", "main") or {}}

    # ── events ──
    def on_change(self, fn: Callable[[dict], None]):
        self.listeners.append(fn)

    def _emit(self, ev: dict):
        for fn in list(self.listeners):
            try:
                fn(ev)
            except Exception:
                pass
