#!/usr/bin/env python3
"""Assemble ui/src into ui/dist/index.html for the local service (tokens are injected at serve time)."""
import pathlib
src = pathlib.Path(__file__).parent / 'src'; dist = pathlib.Path(__file__).parent / 'dist'; dist.mkdir(exist_ok=True)
head = (src / '00_head.html').read_text(); css = (src / '10_styles.css').read_text(); markup = (src / '20_markup.html').read_text()
js = '\n'.join((src / f).read_text() for f in sorted(p.name for p in src.glob('*.js')))
assert '</script>' not in js
page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
{head}<style>
html {{ color-scheme: dark; }} img {{ max-width: 100%; }}
{css}</style></head><body>
{markup}
<script>window.__SB_TOKEN__ = "%%SB_TOKEN%%"; window.__SB_INFO__ = %%SB_INFO%%;</script>
<script src="/vendor/d3.min.js"></script>
<script>
{js}
</script>
</body></html>
"""
(dist / 'index.html').write_text(page)
print(f'wrote {dist / "index.html"} ({len(page) / 1024:.0f} KiB)')
