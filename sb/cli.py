"""`sb` command line: serve, back up, import, export, reindex, doctor, key, git, autostart."""
from __future__ import annotations
import argparse, json, os, plistlib, subprocess, sys, webbrowser, getpass, shutil, datetime as dt
from pathlib import Path
from . import config as cfgmod, backup as bk
from .store import Vault

LABEL = "com.secondbrain.local"

def main(argv=None):
    p = argparse.ArgumentParser(prog="sb", description="Second Brain, local edition")
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("serve", help="run the local service"); s.add_argument("--port", type=int); s.add_argument("--vault"); s.add_argument("--open", action="store_true", help="open the browser")
    sub.add_parser("backup", help="write a zip snapshot now")
    t = sub.add_parser("backup-target", help="manage extra backup folders"); t.add_argument("action", choices=["add", "remove", "list"]); t.add_argument("path", nargs="?")
    i = sub.add_parser("import", help="import a JSON export or a folder of per-document JSON files"); i.add_argument("path")
    e = sub.add_parser("export", help="write a JSON export to vault/exports"); e.add_argument("--out")
    sub.add_parser("reindex", help="rebuild the search index from the files")
    sub.add_parser("doctor", help="check the installation")
    k = sub.add_parser("key", help="store or clear the Anthropic API key"); k.add_argument("action", choices=["set", "clear", "status"])
    g = sub.add_parser("git", help="version the vault with git"); g.add_argument("action", choices=["init", "status"])
    a = sub.add_parser("autostart", help="start the service at login (macOS LaunchAgent)"); a.add_argument("action", choices=["install", "remove", "status"])
    sub.add_parser("open", help="open the app in the browser")
    sub.add_parser("app", help="open Second Brain in its own window (starts the service if needed)")
    b = sub.add_parser("bundle", help="create or remove \"Second Brain.app\" in ~/Applications"); b.add_argument("action", choices=["install", "remove", "status"])
    args = p.parse_args(argv)
    cfg = cfgmod.load()
    if getattr(args, "vault", None):
        cfg["vault"] = args.vault
    if getattr(args, "port", None):
        cfg["port"] = args.port
    return COMMANDS[args.cmd](args, cfg)

def cmd_serve(args, cfg):
    import uvicorn
    from .server import create_app
    from .app import _port_open, _is_ours
    url = f"http://127.0.0.1:{cfg['port']}/"
    if _port_open(int(cfg["port"])) and _is_ours(int(cfg["port"])):
        print(f"Second Brain is already running at {url}")
        if args.open:
            webbrowser.open(url)
        return 0
    app = create_app(cfg)
    print(f"Second Brain at {url}  (vault: {cfg['vault']})")
    if args.open:
        import threading; threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    uvicorn.run(app, host="127.0.0.1", port=int(cfg["port"]), log_level="warning")

def cmd_backup(args, cfg):
    v = Vault(cfg["vault"]); r = bk.make_backup(v.root, cfg.get("backup_targets", []), int(cfg.get("keep_backups", 30)))
    print(f"wrote {r['file']} ({r['files']} files)" + (f", copied to {len(r['copies'])} folder(s)" if r["copies"] else "") + (", committed to git" if r["git"] else ""))

def cmd_backup_target(args, cfg):
    targets = list(cfg.get("backup_targets", []))
    if args.action == "add" and args.path:
        pth = str(Path(args.path).expanduser()); targets.append(pth) if pth not in targets else None
    elif args.action == "remove" and args.path:
        targets = [t for t in targets if t != str(Path(args.path).expanduser())]
    cfg["backup_targets"] = targets; cfgmod.save(cfg)
    print("extra backup folders:" + ("".join(f"\n  {t}" for t in targets) or " none"))

def cmd_import(args, cfg):
    v = Vault(cfg["vault"]); src = Path(args.path).expanduser()
    if src.is_dir():
        payload = {"entries": [], "goals": [], "threads": [], "digests": [], "insights": [], "headsup": []}
        for coll in payload:
            for f in (src / coll).glob("*.json") if (src / coll).exists() else []:
                d = json.loads(f.read_text()); d = d.get("data", d) if isinstance(d, dict) and "data" in d and "id" in d else d
                payload[coll].append(d)
        s = src / "settings" / "main.json"
        if s.exists():
            d = json.loads(s.read_text()); payload["settings"] = d.get("data", d)
    else:
        payload = json.loads(src.read_text())
    r = v.merge_import(payload); print(f"imported: {r['written']} written, {r['skipped']} skipped (stored copy was newer); nothing deleted")

def cmd_export(args, cfg):
    v = Vault(cfg["vault"]); out = Path(args.out).expanduser() if args.out else v.root / "exports" / f"second-brain-{dt.date.today().isoformat()}.json"
    out.parent.mkdir(parents=True, exist_ok=True); out.write_text(json.dumps(v.export_payload(), indent=2, ensure_ascii=False)); print(f"wrote {out}")

def cmd_reindex(args, cfg):
    v = Vault(cfg["vault"]); print("reindexed:", v.reindex())

def cmd_doctor(args, cfg):
    v = Vault(cfg["vault"]); c = v.counts(); print(f"vault: {v.root}"); print(f"entries: {c['entries']} (trash {c['trash']}), goals {c['goals']}, threads {c['threads']}, reviews {c['digests']}, readings {c['headsup']}")
    print(f"last backup: {bk.last_backup_at(v.root) or 'never'}; extra folders: {cfg.get('backup_targets') or 'none'}; git: {'on' if bk.git_available(v.root) else 'off'}")
    from .ai import AI
    ai = AI(cfg, v.root / ".usage.jsonl"); print(f"Claude API: {'key present' if ai.available() else 'no key'}; models: {cfg.get('main_model')} / {cfg.get('filing_model')}")
    if ai.available():
        t = ai.test(); print("API test:", "ok" if t["ok"] else "failed: " + str(t.get("error")))
    print("autostart:", "installed" if (Path.home() / "Library/LaunchAgents" / f"{LABEL}.plist").exists() else "not installed")

def cmd_key(args, cfg):
    if args.action == "set":
        k = getpass.getpass("Anthropic API key (input hidden): ").strip(); cfg["api_key"] = k; cfgmod.save(cfg); print("saved to", cfgmod.CONFIG_PATH)
    elif args.action == "clear":
        cfg["api_key"] = ""; cfgmod.save(cfg); print("cleared")
    else:
        print("key stored" if cfg.get("api_key") else "no key stored (the SDK may still find ANTHROPIC_API_KEY or an `ant auth login` profile)")

def cmd_git(args, cfg):
    v = Vault(cfg["vault"])
    if args.action == "init":
        print("git:", "initialised" if bk.git_init(v.root) else "git is not installed")
    else:
        print("git:", "on" if bk.git_available(v.root) else "off")

def cmd_autostart(args, cfg):
    plist = Path.home() / "Library" / "LaunchAgents" / f"{LABEL}.plist"
    if args.action == "install":
        plist.parent.mkdir(parents=True, exist_ok=True)
        logdir = Path.home() / "Library" / "Logs"; logdir.mkdir(exist_ok=True)
        spec = {"Label": LABEL, "ProgramArguments": [sys.executable, "-m", "sb", "serve"], "RunAtLoad": True, "KeepAlive": {"SuccessfulExit": False}, "StandardOutPath": str(logdir / "secondbrain.log"), "StandardErrorPath": str(logdir / "secondbrain.log"), "WorkingDirectory": str(Path(__file__).resolve().parent.parent), "EnvironmentVariables": {"PATH": os.environ.get("PATH", "/usr/bin:/bin")}}
        with open(plist, "wb") as f:
            plistlib.dump(spec, f)
        subprocess.run(["launchctl", "unload", str(plist)], capture_output=True)
        r = subprocess.run(["launchctl", "load", str(plist)], capture_output=True, text=True)
        print("installed", plist, "" if r.returncode == 0 else r.stderr)
    elif args.action == "remove":
        subprocess.run(["launchctl", "unload", str(plist)], capture_output=True)
        if plist.exists():
            plist.unlink()
        print("removed")
    else:
        print("installed" if plist.exists() else "not installed")

def cmd_open(args, cfg):
    webbrowser.open(f"http://127.0.0.1:{cfg['port']}/")

def cmd_app(args, cfg):
    from .app import run_window
    run_window(cfg)

def cmd_bundle(args, cfg):
    from .app import install_bundle, remove_bundle, bundle_path
    if args.action == "install":
        print("created", install_bundle())
    elif args.action == "remove":
        print("removed" if remove_bundle() else "not installed")
    else:
        print("installed at " + str(bundle_path()) if bundle_path().exists() else "not installed")

COMMANDS = {"serve": cmd_serve, "app": cmd_app, "bundle": cmd_bundle, "backup": cmd_backup, "backup-target": cmd_backup_target, "import": cmd_import, "export": cmd_export, "reindex": cmd_reindex, "doctor": cmd_doctor, "key": cmd_key, "git": cmd_git, "autostart": cmd_autostart, "open": cmd_open}

if __name__ == "__main__":
    sys.exit(main())
