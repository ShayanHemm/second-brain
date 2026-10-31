"""Claude through the official Anthropic SDK. The page sends a prompt (or turns) and a tier; this module picks
the model, asks for JSON when requested, logs usage, and maps failures to the codes the interface understands."""
from __future__ import annotations
import datetime as dt, json, re, threading
from pathlib import Path
import anthropic

PRICES = {  # USD per million tokens (input, output), Anthropic first-party rates
    "claude-opus-5-5": (4.0, 20.0), "claude-opus-5": (5.0, 25.0), "claude-sonnet-5": (2.0, 10.0), "claude-haiku-4-5": (1.0, 5.0), "claude-opus-4-8": (5.0, 25.0),
}
EFFORT = {"filing": "high", "links": "medium", "weekly": "high", "monthly": "high", "insights": "high", "headsup": "high", "think": "medium", "think_summary": "medium", "": "medium"}

class AIError(Exception):
    def __init__(self, code: str, message: str = "", text: str | None = None):
        super().__init__(message or code); self.code = code; self.message = message or code; self.text = text

class AI:
    def __init__(self, cfg: dict, usage_log: Path):
        self.cfg = cfg; self.usage_log = usage_log; self.lock = threading.Lock()
        key = (cfg.get("api_key") or "").strip()
        try:
            self.client = anthropic.Anthropic(api_key=key) if key else anthropic.Anthropic()
        except Exception:
            self.client = None
        self.key_present = bool(key) or self._env_credentials()

    @staticmethod
    def _env_credentials() -> bool:
        import os
        if os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"):
            return True
        return (Path.home() / ".config" / "anthropic").exists()

    def available(self) -> bool:
        return self.client is not None and self.key_present

    def model_for(self, tier: str, purpose: str) -> str:
        if tier == "quick":                      # the app's "Quick" filing depth
            return "claude-haiku-4-5"
        if purpose in ("filing", "links"):
            return self.cfg.get("filing_model") or "claude-opus-5"
        return self.cfg.get("main_model") or "claude-opus-5"

    def test(self) -> dict:
        try:
            r = self._create("claude-haiku-4-5", [{"role": "user", "content": "Reply with the single word: ready"}], max_tokens=20, effort=None)
            return {"ok": True, "model": r.model}
        except AIError as e:
            return {"ok": False, "error": e.message}

    def _create(self, model: str, messages: list, max_tokens: int, effort: str | None):
        kwargs = dict(model=model, max_tokens=max_tokens, messages=messages)
        if effort and not model.startswith("claude-haiku"):
            kwargs["output_config"] = {"effort": effort}
        try:
            if model.startswith("claude-opus-5") or model.startswith("claude-fable"):
                try:  # server-side refusal fallbacks (the SDK default pattern for Opus-5-class code)
                    return self.client.beta.messages.create(betas=["server-side-fallback-2026-07-01"], fallbacks="default", **kwargs)
                except TypeError:
                    return self.client.messages.create(**kwargs)
                except anthropic.BadRequestError as e:
                    if "fallback" in str(getattr(e, "message", e)).lower():   # the model or account does not take the parameter yet
                        return self.client.messages.create(**kwargs)
                    raise
            return self.client.messages.create(**kwargs)
        except anthropic.AuthenticationError as e:
            raise AIError("session_expired", "The API key was rejected.")
        except anthropic.PermissionDeniedError as e:
            raise AIError("sampling_disabled", "This key is not allowed to use that model.")
        except anthropic.NotFoundError as e:
            raise AIError("upstream_error", f"Model not found: {model}")
        except anthropic.RateLimitError as e:
            raise AIError("rate_limited", "Rate limited by the API; try again in a minute.")
        except anthropic.BadRequestError as e:
            msg = getattr(e, "message", str(e))
            if "prompt is too long" in msg or "too many tokens" in msg:
                raise AIError("prompt_too_large", msg)
            raise AIError("invalid_request", msg)
        except anthropic.APIStatusError as e:
            raise AIError("upstream_error", f"API error {e.status_code}")
        except anthropic.APIConnectionError:
            raise AIError("upstream_error", "Could not reach the Anthropic API. Check the connection.")

    def complete(self, input, tier: str = "default", json_mode: bool = False, purpose: str = "") -> dict:
        if not self.available():
            raise AIError("not_granted", "No API key configured.")
        messages = [{"role": "user", "content": input}] if isinstance(input, str) else [{"role": m["role"], "content": m["content"]} for m in input]
        if not messages or messages[0]["role"] != "user" or messages[-1]["role"] != "user":
            raise AIError("invalid_request", "turns must start and end with the user")
        model = self.model_for(tier, purpose); effort = EFFORT.get(purpose, "medium")
        resp = self._create(model, messages, max_tokens=16000, effort=effort)
        if resp.stop_reason == "refusal":
            raise AIError("refused", "Claude declined this input.")
        text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text").strip()
        self._log_usage(resp, purpose)
        if not text:
            raise AIError("empty_completion", "Claude returned no text.")
        out = {"text": text, "truncated": resp.stop_reason == "max_tokens", "tier": tier, "model": resp.model}
        if json_mode:
            val = tolerant_json(text)
            if val is None or resp.stop_reason == "max_tokens":
                raise AIError("invalid_json", "The answer held no JSON value.", text)
            out["value"] = val
        return out

    def _log_usage(self, resp, purpose: str):
        try:
            u = resp.usage; pin, pout = PRICES.get(resp.model, PRICES.get(resp.model.rsplit("-20", 1)[0], (4.0, 20.0)))
            cost = (u.input_tokens * pin + u.output_tokens * pout) / 1e6
            rec = {"at": dt.datetime.now().astimezone().isoformat(timespec="seconds"), "model": resp.model, "purpose": purpose, "in": u.input_tokens, "out": u.output_tokens, "cache_read": getattr(u, "cache_read_input_tokens", 0) or 0, "cost_usd": round(cost, 6)}
            with self.lock:
                with open(self.usage_log, "a") as f:
                    f.write(json.dumps(rec) + "\n")
        except Exception:
            pass

    def usage_this_month(self) -> dict:
        month = dt.date.today().strftime("%Y-%m"); calls = 0; cost = 0.0
        try:
            for line in open(self.usage_log):
                try:
                    r = json.loads(line)
                except Exception:
                    continue
                if str(r.get("at", "")).startswith(month):
                    calls += 1; cost += float(r.get("cost_usd", 0))
        except FileNotFoundError:
            pass
        return {"month": month, "calls": calls, "costUsd": round(cost, 4)}

def tolerant_json(text: str):
    """Whole text; else one fenced block; else first '{' or '[' to the last '}' or ']'."""
    for cand in (text, _fenced(text), _braced(text)):
        if not cand:
            continue
        try:
            return json.loads(cand)
        except Exception:
            continue
    return None

def _fenced(text: str):
    m = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    return m.group(1).strip() if m else None

def _braced(text: str):
    starts = [i for i in (text.find("{"), text.find("[")) if i >= 0]
    if not starts:
        return None
    s = min(starts); e = max(text.rfind("}"), text.rfind("]"))
    return text[s:e + 1] if e > s else None
