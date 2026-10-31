"""Draw the app icon (constellation on a night ground) and produce AppIcon.icns via iconutil."""
import math, pathlib, subprocess, sys
from PIL import Image, ImageDraw, ImageFilter
root = pathlib.Path(__file__).resolve().parent.parent / "assets"; root.mkdir(exist_ok=True)
S = 1024; img = Image.new("RGBA", (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
# rounded square with a subtle vertical gradient
mask = Image.new("L", (S, S), 0); ImageDraw.Draw(mask).rounded_rectangle((60, 60, S - 60, S - 60), radius=230, fill=255)
grad = Image.new("RGBA", (S, S)); gd = ImageDraw.Draw(grad)
for y in range(S):
    t = y / S; gd.line([(0, y), (S, y)], fill=(int(15 + 15 * t), int(14 + 13 * t), int(23 + 31 * t), 255))
img.paste(grad, (0, 0), mask)
# glow behind the hub
glow = Image.new("RGBA", (S, S), (0, 0, 0, 0)); ImageDraw.Draw(glow).ellipse((330, 300, 700, 670), fill=(242, 177, 52, 70)); glow = glow.filter(ImageFilter.GaussianBlur(90)); img.alpha_composite(glow)
nodes = [((512, 470), 74, (242, 177, 52)), ((300, 330), 40, (138, 180, 248)), ((740, 300), 34, (242, 184, 160)), ((300, 700), 30, (127, 209, 200)), ((720, 690), 46, (138, 180, 248)), ((560, 780), 24, (201, 166, 245)), ((200, 520), 20, (247, 161, 196))]
d = ImageDraw.Draw(img)
for i, (p, r, c) in enumerate(nodes):
    for q, r2, c2 in nodes[i + 1:]:
        if math.dist(p, q) < 420: d.line([p, q], fill=(236, 232, 246, 60), width=6)
for p, r, c in nodes:
    d.ellipse((p[0] - r, p[1] - r, p[0] + r, p[1] + r), fill=c + (255,), outline=(15, 14, 23, 255), width=6)
d.rounded_rectangle((60, 60, S - 60, S - 60), radius=230, outline=(236, 232, 246, 40), width=4)
img.save(root / "AppIcon.png")
iconset = root / "AppIcon.iconset"; iconset.mkdir(exist_ok=True)
for size in (16, 32, 128, 256, 512):
    img.resize((size, size), Image.LANCZOS).save(iconset / f"icon_{size}x{size}.png")
    img.resize((size * 2, size * 2), Image.LANCZOS).save(iconset / f"icon_{size}x{size}@2x.png")
r = subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(root / "AppIcon.icns")], capture_output=True, text=True)
print("icns:", "ok" if r.returncode == 0 else r.stderr)
