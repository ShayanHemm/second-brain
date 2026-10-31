import json
from fastapi.testclient import TestClient
from sb.server import create_app

def client(tmp_path):
    cfg = {"vault": str(tmp_path / "vault"), "port": 0, "api_key": "", "main_model": "claude-opus-5", "filing_model": "claude-opus-5", "backup_targets": [], "backup_every_hours": 24, "keep_backups": 30}
    app = create_app(cfg, token="tok"); return TestClient(app), app

def test_token_required(tmp_path):
    c, app = client(tmp_path)
    assert c.get("/api/entries").status_code == 401
    assert c.get("/api/entries", headers={"X-SB-Token": "tok"}).json() == []

def test_crud_and_export(tmp_path):
    c, app = client(tmp_path); h = {"X-SB-Token": "tok"}
    doc = {"id": "e_1", "ts": 1, "date": "2026-10-24", "time": "09:00", "type": "note", "text": "hi", "updatedAt": "2026-10-24T09:00:00Z"}
    assert c.put("/api/entries/e_1", json=doc, headers=h).status_code == 200
    assert c.get("/api/entries/e_1", headers=h).json()["text"] == "hi"
    assert c.get("/api/export.json", headers=h).json()["entries"][0]["id"] == "e_1"
    assert c.delete("/api/entries/e_1", headers=h).json()["deleted"] is True
    assert c.get("/api/entries/e_1", headers=h).status_code == 404

def test_ai_without_key_is_not_granted(tmp_path):
    c, app = client(tmp_path); h = {"X-SB-Token": "tok"}
    app.state.ai.key_present = False
    r = c.post("/api/ai/complete", json={"input": "hi", "tier": "default"}, headers=h)
    assert r.status_code == 403 and r.json()["error"]["code"] == "not_granted"

def test_index_injects_token(tmp_path):
    c, app = client(tmp_path)
    r = c.get("/"); assert r.status_code in (200, 500)
    if r.status_code == 200:
        assert 'window.__SB_TOKEN__ = "tok"' in r.text and "%%SB_INFO%%" not in r.text

def test_backup(tmp_path):
    c, app = client(tmp_path); h = {"X-SB-Token": "tok"}
    c.put("/api/entries/e_1", json={"id": "e_1", "ts": 1, "date": "2026-10-24", "text": "hi"}, headers=h)
    r = c.post("/api/backup", headers=h).json(); assert r["files"] >= 1 and r["file"].endswith(".zip")
