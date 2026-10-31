"""A native window for the local service (pywebview on WebKit), plus the macOS app bundle that launches it."""
from __future__ import annotations
import os, plistlib, shutil, socket, subprocess, sys, threading, time, urllib.request
from pathlib import Path
from . import config as cfgmod

ROOT = Path(__file__).resolve().parent.parent
APP_NAME = "Second Brain"
BUNDLE_ID = "com.secondbrain.app"

def _port_open(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.3):
            return True
    except OSError:
        return False

def _is_ours(port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=2) as r:
            return r.status == 200 and b"<title>Second Brain</title>" in r.read(4000)
    except Exception:
        return False

def ensure_server(cfg: dict) -> tuple[int, bool]:
    """Attach to a running Second Brain on the configured port, else start one in this process. Returns (port, started_here)."""
    port = int(cfg["port"])
    if _port_open(port):
        if _is_ours(port):
            return port, False
        for p in range(port + 1, port + 11):   # something else owns the port; pick the next free one
            if not _port_open(p):
                port = p; break
    import uvicorn
    from .server import create_app
    server = uvicorn.Server(uvicorn.Config(create_app(cfg), host="127.0.0.1", port=port, log_level="warning"))
    threading.Thread(target=server.run, daemon=True).start()
    for _ in range(100):
        if _port_open(port):
            break
        time.sleep(0.1)
    return port, True

def run_window(cfg: dict | None = None):
    cfg = cfg or cfgmod.load()
    try:
        from Foundation import NSBundle  # name the process after the app in the menu bar
        info = NSBundle.mainBundle().infoDictionary()
        if info is not None:
            info["CFBundleName"] = APP_NAME
    except Exception:
        pass
    import webview
    port, started = ensure_server(cfg)
    url = f"http://127.0.0.1:{port}/"
    window = webview.create_window(APP_NAME, url, width=1360, height=900, min_size=(900, 620), text_select=True)
    def after_start():
        try:
            from AppKit import NSApplication, NSImage
            from PyObjCTools import AppHelper
            icon = ROOT / "assets" / "AppIcon.png"
            if icon.exists():
                AppHelper.callAfter(lambda: NSApplication.sharedApplication().setApplicationIconImage_(NSImage.alloc().initWithContentsOfFile_(str(icon))))
        except Exception:
            pass
    webview.start(after_start)   # blocks until the window is closed

def bundle_path() -> Path:
    """Prefer the main /Applications folder when it is writable; otherwise the user's own ~/Applications."""
    main = Path("/Applications")
    if os.access(main, os.W_OK):
        return main / f"{APP_NAME}.app"
    return Path.home() / "Applications" / f"{APP_NAME}.app"

def install_bundle(python: str | None = None) -> Path:
    """Write ~/Applications/Second Brain.app: a launcher that runs `sb app` with this project's Python."""
    python = python or sys.executable
    app = bundle_path(); macos = app / "Contents" / "MacOS"; res = app / "Contents" / "Resources"
    macos.mkdir(parents=True, exist_ok=True); res.mkdir(parents=True, exist_ok=True)
    launcher = macos / "launcher"
    launcher.write_text(f"""#!/bin/zsh
cd "{ROOT}"
exec "{python}" -m sb app >> "$HOME/Library/Logs/secondbrain-app.log" 2>&1
""")
    launcher.chmod(0o755)
    icns = ROOT / "assets" / "AppIcon.icns"
    if icns.exists():
        shutil.copy2(icns, res / "AppIcon.icns")
    plist = {"CFBundleName": APP_NAME, "CFBundleDisplayName": APP_NAME, "CFBundleIdentifier": BUNDLE_ID, "CFBundleVersion": "0.1.0", "CFBundleShortVersionString": "0.1.0", "CFBundlePackageType": "APPL", "CFBundleExecutable": "launcher", "CFBundleIconFile": "AppIcon", "NSHighResolutionCapable": True, "LSMinimumSystemVersion": "12.0", "NSHumanReadableCopyright": "Local-first second brain"}
    with open(app / "Contents" / "Info.plist", "wb") as f:
        plistlib.dump(plist, f)
    subprocess.run(["touch", str(app)], capture_output=True)   # nudge Finder to refresh the icon
    return app

def remove_bundle() -> bool:
    app = bundle_path()
    if app.exists():
        shutil.rmtree(app); return True
    return False
