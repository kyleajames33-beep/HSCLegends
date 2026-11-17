"""Export registered Reactor Clash sprites and assemble the review sheet with Pillow."""
import hashlib
import io
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageStat

ROOT = Path(__file__).resolve().parents[3]
MANIFEST = Path(__file__).with_name("manifest.json")
manifest = json.loads(MANIFEST.read_text())
sources = {}
for record in manifest["generations"]:
    if record["master"]:
        path = ROOT / record["master"]
        assert hashlib.sha256(path.read_bytes()).hexdigest() == record["sha256"]
        sources[record["id"]] = Image.open(path)

outputs = {}


def export(name, relative_path, image, source, lossless=True):
    path = ROOT / relative_path
    path.parent.mkdir(parents=True, exist_ok=True)
    for quality in ([100] if lossless else [88, 82, 76, 70, 64, 58, 52, 46]):
        data = io.BytesIO()
        image.save(data, format="WEBP", lossless=lossless, quality=quality, method=6)
        if data.tell() < 60_000:
            break
    path.write_bytes(data.getvalue())
    with Image.open(path) as check:
        check.load()
        assert check.size == image.size and check.mode == image.mode
        if lossless:
            alpha = check.getchannel("A")
            assert alpha.getextrema() == (0, 255)
            x1, y1, x2, y2 = alpha.getbbox()
            assert 0 < x1 < x2 < check.width and 0 < y1 < y2 < check.height
    outputs[name] = dict(path=relative_path, size=list(image.size), bytes=path.stat().st_size, source=source)


def player(name, image, source):
    export(name, f"public/art/arena/players/operative-{name}.webp",
           image.resize((96, 96), Image.Resampling.LANCZOS), source)


cover = ImageOps.fit(sources["coverFinal"].convert("RGB"), (1600, 900), Image.Resampling.LANCZOS)
copy_area = cover.crop((0, 0, 720, 900)).convert("L")
histogram = copy_area.histogram()
assert sum(histogram[45:]) < copy_area.width * copy_area.height * .01
assert ImageStat.Stat(copy_area).mean[0] < 25
export("cover", "public/art/keyart/reactor-clash-card.webp", cover, "coverFinal", lossless=False)

for team, source, answering in [("blue", "walk", "answer"), ("orange", "walkOrange", "answerOrange")]:
    atlas = sources[source].convert("RGBA")
    assert atlas.size == (1254, 1254)
    for i in range(4):
        x, y = (i % 2) * 627, (i // 2) * 627
        cell = atlas.crop((x, y, x + 627, y + 627))
        bounds = cell.getchannel("A").point(lambda a: 255 if a > 32 else 0).getbbox()
        assert bounds and all(3 < v < 624 for v in bounds)
        # Fixed size and origin retain the helmet registration and natural stride length.
        player(f"{team}-walk-{i + 1}", cell.crop((-22, -43, 650, 629)), source)
    # Match torso width to idle. The terminal reaches north of the body.
    player(f"{team}-answering", sources[answering].convert("RGBA").crop((-5, 30, 1255, 1290)), answering)
    strips = [Image.open(ROOT / outputs[f"{team}-walk-{i}"]["path"]) for i in range(1, 5)]
    assert len({im.getchannel("A").tobytes() for im in strips}) == 4

boss = sources["bossFinal"].convert("RGBA").resize((192, 192), Image.Resampling.LANCZOS)
export("boss", "public/art/arena/boss/chemistry-boss-topdown.webp", boss, "bossFinal")
assert len(outputs) == 12
manifest["deliveries"] = outputs
MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")

sheet = Image.new("RGB", (1440, 1450), "#0E1020")
draw = ImageDraw.Draw(sheet)
font_dir = "/usr/share/fonts/truetype/dejavu/"


def label(x, y, value, size=19, bold=False):
    style = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    draw.text((x, y), value, font=ImageFont.truetype(font_dir + style, size), fill="#F2F2FA" if bold else "#ABB2CA")


def preview(path, x, y, scale=1):
    sprite = Image.open(ROOT / path).convert("RGBA")
    if scale != 1:
        sprite = sprite.resize((sprite.width * scale, sprite.height * scale), Image.Resampling.LANCZOS)
    sheet.paste(sprite, (x, y), sprite)


label(40, 25, "REACTOR CLASH / ARENA ROUND 2", 33, True)
label(40, 79, "Home cover · 1600 × 900", 20)
sheet.paste(Image.open(ROOT / outputs["cover"]["path"]).resize((960, 540), Image.Resampling.LANCZOS), (40, 120))
label(1040, 120, "REACTOR PRIME", 24, True)
label(1040, 155, "192px boss · 64px minion", 17)
floor = Image.open(ROOT / "public/art/arena/tiles/floor-plain.webp")
for row in range(5):
    for col in range(6):
        sheet.paste(floor, (1040 + col * 48, 202 + row * 48))
preview(outputs["boss"]["path"], 1050, 222)
preview("public/art/arena/minions/chemistry-minion.webp", 1244, 287)

label(40, 704, "OPERATIVE WALK CYCLE AND ANSWERING", 23, True)
label(40, 744, "2× detail with native 96px previews below each pose", 18)
for col, name in enumerate(["Idle reference", "1 · Left contact", "2 · Passing", "3 · Right contact", "4 · Passing", "Answering"]):
    label(104 + col * 216, 785, name, 16, True)
for row, team in enumerate(["blue", "orange"]):
    y = 814 + row * 306
    label(20, y + 73, team.title(), 16, True)
    paths = [f"public/art/arena/players/operative-{team}.webp"]
    paths += [outputs[f"{team}-walk-{i}"]["path"] for i in range(1, 5)]
    paths.append(outputs[f"{team}-answering"]["path"])
    for col, path in enumerate(paths):
        x = 82 + col * 216
        preview(path, x, y, 2)
        preview(path, x + 48, y + 178)
sheet.save(ROOT / "art/review/arena-round2-sheet.png")
print("Verified 12 export dimensions and modes, sprite padding, distinct walk silhouettes and cover text area.")
