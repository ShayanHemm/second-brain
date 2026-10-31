#!/usr/bin/env python3
"""Build the static demo (docs/index.html): the interface with the fictional journal baked in, no service, no Claude.
GitHub Pages serves docs/ as the live demo."""
import json, pathlib, shutil
root = pathlib.Path(__file__).resolve().parent.parent; src = root / "ui" / "src"; docs = root / "docs"; (docs / "vendor").mkdir(parents=True, exist_ok=True)
shutil.copy2(root / "ui" / "vendor" / "d3.min.js", docs / "vendor" / "d3.min.js")
head = (src / "00_head.html").read_text(); css = (src / "10_styles.css").read_text(); markup = (src / "20_markup.html").read_text()
js = "\n".join((src / f).read_text() for f in sorted(p.name for p in src.glob("*.js")) if not f.startswith("25_local_bridge"))
data = json.loads((root / "demo" / "second-brain-demo.json").read_text())
data["banner"] = "Live demo with a fictional eight-week journal. Nothing you type here is kept and Claude is switched off; the real app runs on your own machine with your own vault."
page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
{head}<style>
html {{ color-scheme: dark; }} img {{ max-width: 100%; }}
{css}</style></head><body>
{markup}
<script>window.SB_DEMO = {json.dumps(data, ensure_ascii=False).replace("</", "<\\/")};</script>
<script src="vendor/d3.min.js"></script>
<script>
{js}
</script>
</body></html>
"""
(docs / "index.html").write_text(page)
print(f"wrote {docs / 'index.html'} ({len(page) / 1024:.0f} KiB, {len(data['entries'])} entries)")
