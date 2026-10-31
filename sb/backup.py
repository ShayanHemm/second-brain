"""Zip snapshots of the vault, optional copies to extra folders, optional git commits."""
from __future__ import annotations
import datetime as dt, shutil, subprocess, zipfile
from pathlib import Path

EXCLUDE_DIRS = {"backups", "exports", ".git"}
EXCLUDE_FILES = {".index.sqlite", ".index.sqlite-wal", ".index.sqlite-shm", ".DS_Store"}

def list_backups(vault: Path) -> list[Path]:
    return sorted((vault / "backups").glob("sb-*.zip"))

def last_backup_at(vault: Path) -> str | None:
    bs = list_backups(vault)
    if not bs:
        return None
    return dt.datetime.fromtimestamp(bs[-1].stat().st_mtime).astimezone().isoformat(timespec="seconds")

def make_backup(vault: Path, targets: list[str] | None = None, keep: int = 30) -> dict:
    vault = Path(vault)
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    out = vault / "backups" / f"sb-{stamp}.zip"
    tmp = out.with_suffix(".zip.tmp")
    n = 0
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
        for p in sorted(vault.rglob("*")):
            rel = p.relative_to(vault)
            if not rel.parts or rel.parts[0] in EXCLUDE_DIRS or p.name in EXCLUDE_FILES or p.name.endswith(".tmp"):
                continue
            if p.is_file():
                z.write(p, str(rel)); n += 1
    tmp.replace(out)
    # prune: keep the newest `keep`, plus the first backup of each month
    bs = list_backups(vault)
    if len(bs) > keep:
        firsts = {}
        for b in bs:
            firsts.setdefault(b.name[3:9], b)
        for b in bs[:-keep]:
            if firsts.get(b.name[3:9]) != b:
                b.unlink()
    copies = []
    for t in targets or []:
        try:
            td = Path(t).expanduser(); td.mkdir(parents=True, exist_ok=True)
            shutil.copy2(out, td / out.name); copies.append(str(td / out.name))
        except Exception:
            pass
    committed = git_commit(vault, f"backup {stamp}")
    return {"file": str(out), "files": n, "copies": copies, "git": committed, "at": last_backup_at(vault)}

def git_available(vault: Path) -> bool:
    return (Path(vault) / ".git").exists() and shutil.which("git") is not None

def git_init(vault: Path) -> bool:
    vault = Path(vault)
    if not shutil.which("git"):
        return False
    if not (vault / ".git").exists():
        subprocess.run(["git", "init", "-q"], cwd=vault, check=False)
    gi = vault / ".gitignore"
    if not gi.exists():
        gi.write_text("backups/\nexports/\n.index.sqlite*\n.DS_Store\n")
    return git_commit(vault, "init") or True

def git_commit(vault: Path, message: str) -> bool:
    if not git_available(vault):
        return False
    try:
        subprocess.run(["git", "add", "-A"], cwd=vault, check=False, capture_output=True)
        r = subprocess.run(["git", "commit", "-q", "-m", message], cwd=vault, check=False, capture_output=True)
        return r.returncode == 0
    except Exception:
        return False
