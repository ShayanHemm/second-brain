"""The local service: serves the page, the JSON API over the vault, live change events, Claude calls, backups."""
from __future__ import annotations
import asyncio, json, mimetypes, secrets, subprocess, threading, time, datetime as dt
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Depends
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse, FileResponse, PlainTextResponse, Response
from starlette.concurrency import run_in_threadpool
from . import config as cfgmod, backup as bk
from .store import Vault, COLLECTIONS
from .ai import AI, AIError

ROOT = Path(__file__).resolve().parent.parent
UI = ROOT / "ui" / "dist" / "index.html"
VENDOR = ROOT / "ui" / "vendor"

def create_app(cfg: dict | None = None, token: str | None = None) -> FastAPI:
    cfg = cfg or cfgmod.load()
    vault = Vault(cfg["vault"])
    ai = AI(cfg, vault.root / ".usage.jsonl")
    token = token or cfgmod.get_token()
    from contextlib import asynccontextmanager
    @asynccontextmanager
    async def lifespan(_app):
        loop_holder["loop"] = asyncio.get_running_loop()
        threading.Thread(target=backup_loop, args=(vault, cfg), daemon=True).start()
        yield
    app = FastAPI(title="Second Brain", docs_url=None, redoc_url=None, lifespan=lifespan)
    app.state.vault, app.state.ai, app.state.cfg, app.state.token = vault, ai, cfg, token
    queues: set[asyncio.Queue] = set()
    loop_holder: dict = {}

    def push(ev: dict):
        loop = loop_holder.get("loop")
        if not loop:
            return
        for q in list(queues):
            loop.call_soon_threadsafe(q.put_nowait, ev)
    vault.on_change(push)

    def auth(request: Request):
        t = request.headers.get("X-SB-Token") or request.query_params.get("t")
        if t != app.state.token:
            raise HTTPException(401, {"code": "not_granted", "message": "bad token; reload the page"})

    def err(code: str, message: str, status: int = 400, text: str | None = None):
        body = {"error": {"code": code, "message": message}}
        if text is not None:
            body["error"]["text"] = text
        return JSONResponse(body, status_code=status)

    def info() -> dict:
        bs = bk.list_backups(vault.root)
        return {"vault": str(vault.root), "backupsDir": str(vault.root / "backups"), "counts": vault.counts(), "lastBackupAt": bk.last_backup_at(vault.root), "backupCount": len(bs), "backupTargets": cfg.get("backup_targets", []), "git": bk.git_available(vault.root), "aiAvailable": ai.available(), "models": {"main": cfg.get("main_model"), "filing": cfg.get("filing_model")}, "usage": ai.usage_this_month(), "version": "0.1.0", "port": cfg.get("port")}


    @app.get("/", response_class=HTMLResponse)
    def index():
        if not UI.exists():
            return HTMLResponse("<h1>Second Brain</h1><p>The interface is not built yet. Run <code>python3 ui/build.py</code>.</p>", status_code=500)
        html = UI.read_text().replace("%%SB_TOKEN%%", app.state.token).replace("%%SB_INFO%%", json.dumps(info()))
        return HTMLResponse(html, headers={"Cache-Control": "no-store"})

    @app.get("/vendor/{name}")
    def vendor(name: str):
        p = (VENDOR / name).resolve()
        if VENDOR.resolve() not in p.parents or not p.exists():
            raise HTTPException(404)
        return FileResponse(p)

    @app.get("/assets/{name}")
    def asset(name: str):
        p = (vault.root / "assets" / name).resolve()
        if (vault.root / "assets").resolve() not in p.parents or not p.exists():
            raise HTTPException(404)
        return FileResponse(p)

    @app.get("/api/info", dependencies=[Depends(auth)])
    def get_info():
        return info()

    @app.get("/api/events")
    async def events(request: Request):
        auth(request)
        q: asyncio.Queue = asyncio.Queue(); queues.add(q)
        async def gen():
            try:
                yield "retry: 3000\n\n"
                while True:
                    try:
                        ev = await asyncio.wait_for(q.get(), timeout=20)
                        yield f"data: {json.dumps(ev)}\n\n"
                    except asyncio.TimeoutError:
                        yield ": keepalive\n\n"
                    if await request.is_disconnected():
                        break
            finally:
                queues.discard(q)
        return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-store"})

    @app.get("/api/export.json", dependencies=[Depends(auth)])
    def export_json():
        return JSONResponse(vault.export_payload(), headers={"Content-Disposition": f"attachment; filename=second-brain-{dt.date.today().isoformat()}.json"})

    # ── documents ──
    @app.get("/api/{coll}", dependencies=[Depends(auth)])
    def list_docs(coll: str):
        if coll == "assets":
            files = sorted((vault.root / "assets").iterdir()) if (vault.root / "assets").exists() else []
            return {"assets": [{"id": f.name, "url": f"/assets/{f.name}", "sizeBytes": f.stat().st_size} for f in files if f.is_file()], "usage": {}}
        if coll not in COLLECTIONS:
            raise HTTPException(404, {"code": "not_found", "message": "no such collection"})
        return vault.list(coll)

    @app.get("/api/{coll}/{id}", dependencies=[Depends(auth)])
    def get_doc(coll: str, id: str):
        if coll not in COLLECTIONS:
            raise HTTPException(404, {"code": "not_found", "message": "no such collection"})
        d = vault.get(coll, id)
        if d is None:
            return err("not_found", "no such document", 404)
        return d

    @app.put("/api/{coll}/{id}", dependencies=[Depends(auth)])
    async def put_doc(coll: str, id: str, request: Request):
        if coll not in COLLECTIONS:
            raise HTTPException(404, {"code": "not_found", "message": "no such collection"})
        try:
            body = await request.json()
            if not isinstance(body, dict):
                raise ValueError("object required")
            return vault.put(coll, id, body)
        except ValueError as e:
            return err("invalid_argument", str(e))

    @app.delete("/api/{coll}/{id}", dependencies=[Depends(auth)])
    def delete_doc(coll: str, id: str):
        if coll == "assets":
            p = (vault.root / "assets" / id).resolve()
            if (vault.root / "assets").resolve() in p.parents and p.exists():
                dest = vault.root / "trash" / "assets"; dest.mkdir(parents=True, exist_ok=True); p.rename(dest / p.name)
                return {"deleted": True}
            return {"deleted": False}
        if coll not in COLLECTIONS:
            raise HTTPException(404, {"code": "not_found", "message": "no such collection"})
        try:
            return {"deleted": vault.delete(coll, id)}
        except ValueError as e:
            return err("invalid_argument", str(e))

    # ── assets ──
    @app.post("/api/assets", dependencies=[Depends(auth)])
    async def upload_asset(file: UploadFile = File(...)):
        ctype = file.content_type or mimetypes.guess_type(file.filename or "")[0] or ""
        ext = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif"}.get(ctype)
        if not ext:
            return err("unsupported_type", "Only PNG, JPEG, WebP or GIF images.")
        data = await file.read()
        if len(data) > 20 * 1024 * 1024:
            return err("too_large", "Images over 20 MB are not stored.")
        aid = secrets.token_hex(16) + ext
        (vault.root / "assets" / aid).write_bytes(data)
        return {"id": aid, "url": f"/assets/{aid}", "sizeBytes": len(data), "contentType": ctype}

    # ── Claude ──
    @app.post("/api/ai/complete", dependencies=[Depends(auth)])
    async def ai_complete(request: Request):
        body = await request.json()
        try:
            return await run_in_threadpool(ai.complete, body.get("input"), body.get("tier") or "default", bool(body.get("json")), body.get("purpose") or "")
        except AIError as e:
            return err(e.code, e.message, 400 if e.code != "not_granted" else 403, e.text)

    @app.post("/api/ai/test", dependencies=[Depends(auth)])
    async def ai_test():
        return await run_in_threadpool(ai.test)

    @app.post("/api/config", dependencies=[Depends(auth)])
    async def set_config(request: Request):
        body = await request.json()
        changed = False
        for k in ("api_key", "main_model", "filing_model", "backup_targets", "backup_every_hours", "keep_backups"):
            if k in body:
                cfg[k] = body[k]; changed = True
        if changed:
            cfgmod.save(cfg)
            app.state.ai = AI(cfg, vault.root / ".usage.jsonl")
            nonlocal ai  # noqa: PLW0603 - rebind the closure's client after a config change
            ai = app.state.ai
        result = {"saved": changed, "aiAvailable": ai.available()}
        if "api_key" in body and ai.available():
            t = await run_in_threadpool(ai.test)
            result["aiAvailable"] = t["ok"]; result["error"] = t.get("error")
        return result

    # ── maintenance ──
    @app.post("/api/backup", dependencies=[Depends(auth)])
    async def do_backup():
        return await run_in_threadpool(bk.make_backup, vault.root, cfg.get("backup_targets", []), int(cfg.get("keep_backups", 30)))

    @app.post("/api/reindex", dependencies=[Depends(auth)])
    def do_reindex():
        c = vault.reindex(); return {"entries": c.get("entries", 0), "counts": c}

    @app.post("/api/open-vault", dependencies=[Depends(auth)])
    def open_vault():
        try:
            subprocess.Popen(["open", str(vault.root)])
            return {"ok": True}
        except Exception as e:
            return err("upstream_error", str(e), 500)

    @app.post("/api/import", dependencies=[Depends(auth)])
    async def do_import(request: Request):
        body = await request.json()
        if not isinstance(body, dict) or "entries" not in body:
            return err("invalid_argument", "not a Second Brain export")
        return await run_in_threadpool(vault.merge_import, body)

    return app

def backup_loop(vault: Vault, cfg: dict):
    """Snapshot the vault when the last backup is older than the configured interval; check hourly."""
    while True:
        try:
            every = float(cfg.get("backup_every_hours", 24)) * 3600
            last = bk.last_backup_at(vault.root)
            age = time.time() - dt.datetime.fromisoformat(last).timestamp() if last else 1e12
            has_content = vault.counts().get("entries", 0) > 0
            if has_content and age > every:
                bk.make_backup(vault.root, cfg.get("backup_targets", []), int(cfg.get("keep_backups", 30)))
        except Exception:
            pass
        time.sleep(3600)
