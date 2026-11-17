"""Validate the complete Round 6 delivery inventory and catalog mapping."""
from pathlib import Path
import hashlib
import json

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
manifest = json.loads((HERE / "manifest.json").read_text())
deliveries = json.loads((HERE / "deliveries.json").read_text())
cards = json.loads((HERE / "card-mapping.json").read_text())

assert len(manifest["assets"]) == 48
assert len(cards) == len(manifest["catalog"]) == 36
assert len(deliveries) == 59
assert len({d["path"] for d in deliveries}) == 59
assert {c["id"] for c in cards} == {c["id"] for c in manifest["catalog"]}
catalog = {c["id"]: c for c in manifest["catalog"]}

for asset in manifest["assets"]:
    assert asset.get("source"), asset["name"]
    master = ROOT / "art/masters" / asset["group"] / (asset["name"]+".png")
    assert hashlib.sha256(master.read_bytes()).hexdigest() == asset["source_sha256"], master
    with Image.open(master) as image:
        image.verify()
    with Image.open(master) as image:
        assert image.width >= 1024, (master, image.size)
        if asset["transparent"]:
            assert image.mode == "RGBA", master
            assert image.getchannel("A").getextrema() == (0, 255), master
    for reference in asset["references"]:
        assert (ROOT / reference).exists(), reference

for card in cards:
    assert card["rarity"] == catalog[card["id"]]["rarity"]
    assert card["title"] == catalog[card["id"]]["title"]
    assert card["subject"] == catalog[card["id"]]["subject"]
    assert hashlib.sha256((ROOT / card["art_source"]).read_bytes()).hexdigest() == card["art_source_sha256"]
    with Image.open(ROOT / card["master"]) as image:
        assert image.size == (1024, 1408)

over_target = []
for delivery in deliveries:
    path = ROOT / delivery["path"]
    assert path.stat().st_size == delivery["bytes"], path
    with Image.open(path) as image:
        image.load()
        assert list(image.size) == delivery["size"], path
        expected = ((1280, 720) if "/keyart/" in delivery["path"] else
                    (1600, 900) if "/results/" in delivery["path"] else
                    (512, 512) if "/bosses/" in delivery["path"] else
                    (96, 96) if "/icons/" in delivery["path"] else (512, 704))
        assert image.size == expected, (path, image.size, expected)
        if "/keyart/" not in delivery["path"] and "/results/" not in delivery["path"]:
            assert image.mode == "RGBA", path
            assert image.getchannel("A").getextrema() == (0, 255), path
    if delivery["bytes"] >= 60000:
        over_target.append((delivery["path"], delivery["bytes"]))

assert Image.open(ROOT / "art/review/round6-sheet.png").size == (1800, 4300)
assert Image.open(HERE / "cards-sheet.png").size == (1800, 2860)
for subject in ["biology", "chemistry", "physics", "maths-standard", "maths-advanced", "maths-extension-1"]:
    for pose in ["idle", "attack", "hurt", "defeated"]:
        with Image.open(ROOT / f"public/art/bosses/{subject}-boss-{pose}.webp") as image:
            assert image.size == (512, 512)
            assert image.getchannel("A").getextrema() == (0, 255)
print("PASS: 48 generated masters; 36 mapped cards; 59 unique decodable deliveries; dimensions, transparency, catalog parity and all 24 boss poses.")
print("Files above the 60,000-byte target:", over_target)
