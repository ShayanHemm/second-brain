import json
from pathlib import Path
from sb.store import Vault

def entry(id="e_1", **kw):
    d = {"id": id, "createdAt": "2026-10-24T10:00:00Z", "ts": 1792836000000, "date": "2026-10-24", "time": "12:00", "type": "journal", "text": "Hello\n\nSecond paragraph: 100% real.", "title": "Hello", "themes": ["journaling"], "mood": {"ai": 1, "user": None}, "tasks": [{"id": "t1", "text": "do it", "done": False}], "links": [], "updatedAt": "2026-10-24T10:00:00Z"}
    d.update(kw); return d

def test_roundtrip_and_files(tmp_path):
    v = Vault(tmp_path / "vault"); v.put("entries", "e_1", entry())
    f = tmp_path / "vault" / "entries" / "2026" / "2026-10-24-e_1.md"
    assert f.exists() and f.read_text().startswith("---\nid: e_1")
    got = v.get("entries", "e_1"); assert got["text"] == "Hello\n\nSecond paragraph: 100% real." and got["tasks"][0]["text"] == "do it" and got["date"] == "2026-10-24"
    assert [e["id"] for e in v.list("entries")] == ["e_1"]

def test_reindex_from_files(tmp_path):
    v = Vault(tmp_path / "vault"); v.put("entries", "e_1", entry()); v.put("goals", "g_1", {"id": "g_1", "label": "Run"}); v.put("settings", "main", {"instructions": "x"})
    (tmp_path / "vault" / ".index.sqlite").unlink(); v.db.close()
    v2 = Vault(tmp_path / "vault"); assert v2.get("entries", "e_1")["title"] == "Hello" and v2.get("goals", "g_1")["label"] == "Run" and v2.get("settings", "main")["instructions"] == "x"

def test_delete_moves_to_trash(tmp_path):
    v = Vault(tmp_path / "vault"); v.put("entries", "e_1", entry()); assert v.delete("entries", "e_1")
    assert v.get("entries", "e_1") is None and list((tmp_path / "vault" / "trash" / "entries").glob("*e_1.md"))

def test_merge_import_keeps_newer(tmp_path):
    v = Vault(tmp_path / "vault"); v.put("entries", "e_1", entry(updatedAt="2026-10-25T00:00:00Z", title="newer"))
    r = v.merge_import({"entries": [entry(updatedAt="2026-10-24T00:00:00Z", title="older")], "goals": [{"id": "g", "label": "G"}]})
    assert r == {"written": 1, "skipped": 1} and v.get("entries", "e_1")["title"] == "newer"

def test_search(tmp_path):
    v = Vault(tmp_path / "vault"); v.put("entries", "e_1", entry(text="the referral call with Dana"))
    if v.fts:
        assert v.search("Dana") == ["e_1"]

def test_date_change_moves_file(tmp_path):
    v = Vault(tmp_path / "vault"); v.put("entries", "e_1", entry()); v.put("entries", "e_1", entry(date="2026-10-25"))
    assert not (tmp_path / "vault" / "entries" / "2026" / "2026-10-24-e_1.md").exists() and (tmp_path / "vault" / "entries" / "2026" / "2026-10-25-e_1.md").exists()

def test_concurrent_reads_and_writes(tmp_path):
    import threading
    v = Vault(tmp_path / "vault"); errors = []
    def worker(k):
        try:
            for i in range(25):
                v.put("entries", f"e_{k}_{i}", entry(id=f"e_{k}_{i}")); v.list("entries"); v.get("entries", f"e_{k}_{i}"); v.counts()
        except Exception as e:
            errors.append(e)
    ts = [threading.Thread(target=worker, args=(k,)) for k in range(8)]
    [t.start() for t in ts]; [t.join() for t in ts]
    assert not errors and len(v.list("entries")) == 200
