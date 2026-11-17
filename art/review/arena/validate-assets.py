"""Check arena delivery coverage, lossless alpha, scale, floor seams and wall ports."""
from pathlib import Path
import hashlib
import json

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
manifest = json.loads((HERE / "manifest.json").read_text())
assets = manifest["assets"]
expected = {
    "players": {"operative-blue", "operative-orange", "operative-blue-knocked-out", "operative-orange-knocked-out"},
    "tiles": {"floor-plain", "floor-vent", "floor-conduit", "wall-straight", "wall-corner", "wall-end", "doorway", "hazard-floor", "team-base-blue", "team-base-orange"},
    "objects": {"question-terminal-idle", "question-terminal-active", "reactor-neutral", "reactor-blue", "reactor-orange", "energy-pickup", "shield-barrier"},
    "minions": {s+"-minion" for s in ["biology", "chemistry", "physics", "maths-standard", "maths-advanced", "maths-extension-1"]},
    "fx": {"neutraliser-projectile", "hit-spark", "capture-pulse-ring"},
}
assert len(assets) == 30
images = {}
for group, names in expected.items():
    assert {a["name"] for a in assets if a["group"] == group} == names
for a in assets:
    master = ROOT / a["master"]
    assert hashlib.sha256(master.read_bytes()).hexdigest() == a["master_sha256"], master
    with Image.open(master) as im:
        im.load()
        assert max(im.size) >= 1024, (master, im.size)
    path = ROOT / a["delivery"]
    im = Image.open(path)
    im.load()
    is_floor = a["group"] == "tiles" and not a["name"].startswith("wall-") and a["name"] != "doorway"
    assert im.mode == ("RGB" if is_floor else "RGBA"), (path, im.mode)
    im = im.convert("RGBA")
    expected_size = 48 if a["group"] == "tiles" else 64 if a["group"] in {"minions", "fx"} else 96
    assert im.size == (expected_size, expected_size), path
    assert path.stat().st_size == a["bytes"] < 60000
    if a["group"] != "tiles" or a["name"].startswith("wall-") or a["name"] == "doorway":
        assert im.getchannel("A").getextrema() == (0, 255), path
    else:
        assert im.getchannel("A").getextrema() == (255, 255), path
    if a["group"] != "tiles":
        assert a["prompt"] and a["tool"] == "image_gen.imagegen"
        assert a["anchor"] == [0.5, 0.5]
        for ref in a["references"]:
            assert (ROOT / ref).exists()
    images[a["name"]] = im

# All floor types can touch any other floor type in either direction without a
# pixel discontinuity. Compare actual decoded exports, not source geometry.
floors = [images[n] for n in ["floor-plain", "floor-vent", "floor-conduit", "hazard-floor", "team-base-blue", "team-base-orange"]]
for a in floors:
    for b in floors:
        assert a.crop((0, 0, 48, 1)).tobytes() == b.crop((0, 47, 48, 48)).tobytes()
        assert a.crop((0, 0, 1, 48)).tobytes() == b.crop((47, 0, 48, 48)).tobytes()

straight = images["wall-straight"]
profile = straight.crop((0, 0, 48, 1)).tobytes()
assert profile == straight.crop((0, 47, 48, 48)).tobytes()
assert profile == images["wall-corner"].crop((0, 0, 48, 1)).tobytes()
assert profile == images["wall-end"].crop((0, 47, 48, 48)).tobytes()
horizontal = straight.rotate(90)
for name in ["wall-corner", "doorway"]:
    assert images[name].crop((47, 0, 48, 48)).tobytes() == horizontal.crop((47, 0, 48, 48)).tobytes(), name
assert images["capture-pulse-ring"].getpixel((32, 32))[3] == 0
assert images["physics-minion"].getpixel((32, 32))[3] == 0
for name in ["operative-blue", "operative-orange"]:
    small = images[name].resize((48, 48), Image.Resampling.LANCZOS)
    assert sum(small.getchannel("A").histogram()[129:]) > 200
for names in [("operative-blue", "operative-orange"), ("operative-blue-knocked-out", "operative-orange-knocked-out"),
              ("question-terminal-idle", "question-terminal-active"), ("reactor-neutral", "reactor-blue", "reactor-orange")]:
    records = [a for a in assets if a["name"] in names]
    assert len({tuple(a["crop"]) for a in records}) == 1
assert Image.open(ROOT / "art/review/arena-sheet.png").size == (1600, 2200)
assert Image.open(HERE / "sample-map.png").size == (24*48, 14*48)
print("PASS: 30 lossless WebP deliveries; requested dimensions; master hashes; transparent sprites; 48px readability; floor seams; wall ports; state framing; sample map.")
