"""User configuration lives outside the vault (so backups never carry the API key)."""
from __future__ import annotations
import json, os
from pathlib import Path

CONFIG_DIR = Path(os.environ.get("SB_CONFIG_DIR", Path.home() / ".config" / "second-brain"))
CONFIG_PATH = CONFIG_DIR / "config.json"
DEFAULTS = {
    "vault": str(Path.home() / "SecondBrain"),
    "port": 8765,
    "api_key": "",
    "main_model": "claude-opus-5-5",    # reviews, patterns, heads-up, thinking partner
    "filing_model": "claude-opus-5-5",  # structured filing of each entry; 'claude-haiku-4-5' is the quick option
    "backup_targets": [],               # extra folders that receive a copy of every backup zip
    "backup_every_hours": 24,
    "keep_backups": 30,
}

def get_token() -> str:
    """One token per installation, so pages stay valid across service restarts. Stored next to the API key, mode 600."""
    import secrets
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    p = CONFIG_DIR / "token"
    try:
        t = p.read_text().strip()
        if len(t) >= 20:
            return t
    except FileNotFoundError:
        pass
    t = secrets.token_urlsafe(24)
    p.write_text(t); os.chmod(p, 0o600)
    return t

def load() -> dict:
    cfg = dict(DEFAULTS)
    try:
        if CONFIG_PATH.exists():
            cfg.update(json.loads(CONFIG_PATH.read_text()))
    except Exception:
        pass
    if os.environ.get("SB_VAULT"):
        cfg["vault"] = os.environ["SB_VAULT"]
    if os.environ.get("SB_PORT"):
        cfg["port"] = int(os.environ["SB_PORT"])
    return cfg

def save(cfg: dict) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    tmp = CONFIG_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps({k: v for k, v in cfg.items() if k in DEFAULTS}, indent=2))
    os.chmod(tmp, 0o600)
    os.replace(tmp, CONFIG_PATH)
    os.chmod(CONFIG_PATH, 0o600)
