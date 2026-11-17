"""Build Round 6 web assets, framed catalog cards and review sheets from saved masters.

Run from any directory. All generation outputs must be present before building.
Requires Pillow. Does not modify application code or catalog definitions.
"""
from pathlib import Path
import hashlib
import io
import json

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
MANIFEST = HERE / "manifest.json"
RARITIES = ["common", "rare", "epic", "legendary", "mythic"]
BG = "#0E1020"
INK = "#07080F"
PALE = "#F2F2FA"
DIM = "#9A9CC0"


def save_web(image, path, lossless=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    if lossless:
        image.save(path, lossless=True, method=4, exact=True)
        return "lossless"
    for quality in [88, 82, 76, 70, 64, 58, 54, 50, 46, 42]:
        data = io.BytesIO()
        image.save(data, format="WEBP", quality=quality, method=6, exact=True)
        if len(data.getvalue()) < 60000:
            break
    path.write_bytes(data.getvalue())
    return quality


def frame(rarity, accent=DIM):
    tier = RARITIES.index(rarity) + 1
    result = Image.new("RGBA", (1024, 1408))
    draw = ImageDraw.Draw(result)
    cut = 30 + tier * 8
    perimeter = [(cut, 12), (1012-cut, 12), (1012, cut+12),
                 (1012, 1396-cut), (1012-cut, 1396), (cut, 1396),
                 (12, 1396-cut), (12, cut+12), (cut, 12)]
    draw.line(perimeter, fill=INK, width=22 + tier*3, joint="curve")
    draw.line(perimeter, fill=accent, width=5 + tier*2, joint="curve")
    if tier >= 3:
        inset = [(cut+24, 42), (982-cut, 42), (982, cut+42),
                 (982, 1366-cut), (982-cut, 1366), (cut+24, 1366),
                 (42, 1366-cut), (42, cut+42), (cut+24, 42)]
        draw.line(inset, fill=DIM, width=3, joint="curve")
    for index in range(tier):
        x = 512 - ((tier-1)*56)//2 + index*56
        draw.polygon([(x-17, 44), (x+17, 44), (x+12, 65), (x-12, 65)], fill=accent)
    for left in [True, False]:
        x = 58 if left else 966
        sign = 1 if left else -1
        for index in range(tier):
            y = 1230 + index*22
            draw.line((x, y, x+sign*(30+tier*5), y-12), fill=accent, width=7)
    if tier == 5:
        draw.polygon([(482, 1325), (512, 1295), (542, 1325), (512, 1355)], fill=accent)
    return result


def font(size, bold=False):
    suffix = "-Bold" if bold else ""
    return ImageFont.truetype(f"/usr/share/fonts/truetype/dejavu/DejaVuSans{suffix}.ttf", size)


def label(sheet, xy, text, size=20, dim=False, bold=False):
    ImageDraw.Draw(sheet).text(xy, text, font=font(size, bold), fill=DIM if dim else PALE)


def paste(sheet, path, box):
    image = Image.open(path).convert("RGBA")
    x, y, width, height = box
    image = ImageOps.contain(image, (width, height), Image.Resampling.LANCZOS)
    sheet.paste(image, (x+(width-image.width)//2, y+(height-image.height)//2), image)


def build():
    manifest = json.loads(MANIFEST.read_text())
    inventory = HERE / "deliveries.json"
    previous = {d["path"]: d for d in json.loads(inventory.read_text())} if inventory.exists() else {}
    deliveries = []
    for asset in manifest["assets"]:
        master = ROOT / "art/masters" / asset["group"] / (asset["name"]+".png")
        assert master.exists(), master
        if asset["type"] == "collectible-art":
            continue
        target = ROOT / "public/art" / asset["group"] / (asset["name"]+".webp")
        key = str(target.relative_to(ROOT))
        expected_size = [1280, 720] if asset["type"] == "cover" else ([1600, 900] if asset["type"] == "result" else ([96, 96] if asset["type"] == "utility" else [512, 512]))
        if (key in previous and previous[key]["size"] == expected_size and target.exists() and target.stat().st_mtime >= master.stat().st_mtime
                and target.stat().st_size < 60000):
            deliveries.append(previous[key])
            continue
        image = Image.open(master)
        if asset["type"] in ["cover", "result"]:
            image = ImageOps.fit(image.convert("RGB"), tuple(expected_size), Image.Resampling.LANCZOS)
        else:
            size = 96 if asset["type"] == "utility" else 512
            image = image.convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)
        quality = save_web(image, target, asset["type"] == "utility")
        deliveries.append(dict(name=asset["name"], path=str(target.relative_to(ROOT)),
                               size=list(image.size), bytes=target.stat().st_size, quality=quality))

    for rarity in RARITIES:
        image = frame(rarity)
        master = ROOT / f"art/masters/cards/frames/{rarity}.png"
        master.parent.mkdir(parents=True, exist_ok=True)
        image.save(master)
        target = ROOT / f"public/art/cards/frames/{rarity}.webp"
        quality = save_web(image.resize((512, 704), Image.Resampling.LANCZOS), target, True)
        deliveries.append(dict(name="frame-"+rarity, path=str(target.relative_to(ROOT)),
                               size=[512, 704], bytes=target.stat().st_size, quality=quality))

    mappings = []
    old_mapping_path = HERE / "card-mapping.json"
    old_mappings = {c["id"]: c for c in json.loads(old_mapping_path.read_text())} if old_mapping_path.exists() else {}
    accents = {"biology":"#1FB070", "chemistry":"#FF6A2B", "physics":"#2F7BEA",
               "maths-standard":"#F2B530", "maths-advanced":"#9B5CFF", "maths-ext1":"#E8447F"}
    by_name = {a["name"]: a for a in manifest["assets"]}
    for card in manifest["catalog"]:
        subject = "maths-extension-1" if card["subject"] == "maths-ext1" else card["subject"]
        if card["kind"] == "boss":
            source = ROOT / f"art/masters/bosses/{subject}-boss-idle.png"
            accent = accents[card["subject"]]
        else:
            source = ROOT / f"art/masters/cards/art/{card['id']}.png"
            accent = by_name[card["id"]]["accent"]
        assert source.exists(), source
        master = ROOT / f"art/masters/cards/{card['id']}.png"
        target = ROOT / f"public/art/cards/{card['id']}.webp"
        key = str(target.relative_to(ROOT))
        source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
        cached = (key in previous and target.exists() and master.exists()
                  and card["id"] in old_mappings
                  and old_mappings[card["id"]]["art_source_sha256"] == source_hash)
        if cached:
            quality = previous[key]["quality"]
        else:
            canvas = Image.new("RGBA", (1024, 1408))
            draw = ImageDraw.Draw(canvas)
            draw.polygon([(64, 12), (960, 12), (1012, 64), (1012, 1344),
                          (960, 1396), (64, 1396), (12, 1344), (12, 64)], fill=BG)
            draw.polygon([(100, 105), (924, 105), (924, 1180), (100, 1180)], fill="#171A31")
            illustration = ImageOps.contain(Image.open(source).convert("RGBA"), (870, 1030), Image.Resampling.LANCZOS)
            canvas.alpha_composite(illustration, ((1024-illustration.width)//2, 135+(1030-illustration.height)//2))
            canvas.alpha_composite(frame(card["rarity"], accent))
            master = ROOT / f"art/masters/cards/{card['id']}.png"
            master.parent.mkdir(parents=True, exist_ok=True)
            canvas.save(master)
            target = ROOT / f"public/art/cards/{card['id']}.webp"
            output = canvas.resize((512, 704), Image.Resampling.LANCZOS)
            quality = save_web(output, target)
        mapping = dict(id=card["id"], title=card["title"], subject=card["subject"],
                       rarity=card["rarity"], accent=accent,
                       art_source=str(source.relative_to(ROOT)),
                       art_source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
                       master=str(master.relative_to(ROOT)), delivery=str(target.relative_to(ROOT)))
        mappings.append(mapping)
        deliveries.append(dict(name=card["id"], path=mapping["delivery"],
                               size=[512, 704], bytes=target.stat().st_size, quality=quality))
        old_mapping_path.write_text(json.dumps(mappings, indent=2)+"\n")
        inventory.write_text(json.dumps(deliveries, indent=2)+"\n")
        print("Card ready:", card["id"], flush=True)

    (HERE / "card-mapping.json").write_text(json.dumps(mappings, indent=2)+"\n")
    (HERE / "deliveries.json").write_text(json.dumps(deliveries, indent=2)+"\n")

    # Detailed cards review, six columns, catalog order. No text is baked into cards.
    cards_sheet = Image.new("RGB", (1800, 2860), BG)
    label(cards_sheet, (36, 20), "HSC LEGENDS / ROUND 6 / COLLECTIBLE CATALOG", 30, bold=True)
    label(cards_sheet, (36, 65), "Existing IDs + rarities / original art / labels outside card images", 20, dim=True)
    for index, card in enumerate(manifest["catalog"]):
        x = 30 + (index % 6)*295
        y = 110 + (index // 6)*450
        target = ROOT / f"public/art/cards/{card['id']}.webp"
        if target.exists():
            paste(cards_sheet, target, (x, y, 270, 371))
        label(cards_sheet, (x+5, y+380), card["id"], 18)
        label(cards_sheet, (x+5, y+407), card["rarity"], 17, dim=True)
    cards_sheet.save(HERE / "cards-sheet.png")

    # Main overview: every subject is a column, every state is a row.
    sheet = Image.new("RGB", (1800, 4300), BG)
    label(sheet, (36, 20), "HSC LEGENDS / ROUND 6", 34, bold=True)
    label(sheet, (36, 72), "Six complete pose sets / three game cards / seven icons / results / 36 collectibles", 20, dim=True)
    label(sheet, (36, 120), "GAME-CARD COVERS / 1280 x 720", 24, bold=True)
    covers = [a for a in manifest["assets"] if a["type"] == "cover"]
    for index, asset in enumerate(covers):
        x = 30 + index*590
        paste(sheet, ROOT / f"public/art/keyart/{asset['name']}.webp", (x, 168, 560, 315))
        label(sheet, (x, 495), asset["name"], 21)
    label(sheet, (36, 555), "BOSS POSES / IDLE → ATTACK → HURT → DEFEATED ROWS", 24, bold=True)
    attacks = [a for a in manifest["assets"] if a["type"] == "attack"]
    for col, asset in enumerate(attacks):
        subject = asset["name"].removesuffix("-boss-attack")
        label(sheet, (108+col*280, 605), subject, 17, dim=True)
        for row, pose in enumerate(["idle", "attack", "hurt", "defeated"]):
            y = 650+row*280
            if col == 0:
                label(sheet, (15, y+115), pose, 17, dim=True)
            path = ROOT / f"public/art/bosses/{subject}-boss-{pose}.webp"
            paste(sheet, path, (100+col*280, y, 270, 265))
    label(sheet, (36, 1800), "UTILITY ICONS / NATIVE 96px + 24px", 24, bold=True)
    utilities = [a for a in manifest["assets"] if a["type"] == "utility"]
    for index, asset in enumerate(utilities):
        x = 40 + index*250
        path = ROOT / f"public/art/icons/{asset['name']}.webp"
        paste(sheet, path, (x+10, 1855, 96, 96))
        paste(sheet, path, (x+135, 1891, 24, 24))
        label(sheet, (x, 1975), asset["name"], 19)
    label(sheet, (36, 2040), "RESULTS / CLASSROOM LIVE BOSS BATTLE", 24, bold=True)
    for index, name in enumerate(["victory", "defeat"]):
        x = 35 + index*890
        paste(sheet, ROOT / f"public/art/results/{name}.webp", (x, 2095, 850, 478))
        label(sheet, (x, 2590), name, 22)
    label(sheet, (36, 2660), "ALL 36 COLLECTIBLES / DETAIL: round6/cards-sheet.png", 24, bold=True)
    for index, card in enumerate(manifest["catalog"]):
        x = 25 + (index % 12)*148
        y = 2715 + (index // 12)*270
        paste(sheet, ROOT / f"public/art/cards/{card['id']}.webp", (x, y, 133, 183))
        label(sheet, (x, y+190), card["id"], 12)
        label(sheet, (x, y+210), card["rarity"], 12, dim=True)
    label(sheet, (36, 3550), "RARITY FRAMES / COMMON → MYTHIC / 1–5 NOTCHES", 24, bold=True)
    for index, rarity in enumerate(RARITIES):
        x = 50 + index*350
        paste(sheet, ROOT/f"public/art/cards/frames/{rarity}.webp", (x, 3610, 245, 337))
        label(sheet, (x+10, 3970), rarity, 21)
    label(sheet, (36, 4110), "Style 1 characters + scenes / Style 2 icons / background #0E1020", 21, dim=True)
    label(sheet, (36, 4150), "Original decorative art / no in-art text / prompts + masters in docs/ART_ASSETS.md", 20, dim=True)
    sheet.save(ROOT / "art/review/round6-sheet.png")
    poses_sheet = Image.new("RGB", (1600, 2700), BG)
    label(poses_sheet, (25, 16), "ROUND 6 / COMPLETE BOSS POSE SETS", 28)
    for col, pose in enumerate(["idle", "attack", "hurt", "defeated"]):
        label(poses_sheet, (25+col*400, 65), pose.upper(), 23)
    for row, asset in enumerate(attacks):
        subject = asset["name"].removesuffix("-boss-attack")
        y = 110 + row*425
        for col, pose in enumerate(["idle", "attack", "hurt", "defeated"]):
            path = ROOT / f"public/art/bosses/{subject}-boss-{pose}.webp"
            if path.exists(): paste(poses_sheet, path, (20+col*400, y, 365, 365))
        label(poses_sheet, (25, y+375), subject, 21, dim=True)
    poses_sheet.save(HERE / "attacks-sheet.png")
    utilities_sheet = Image.new("RGB", (1120, 260), BG)
    for index, asset in enumerate(utilities):
        x = index*160 + 12
        path = ROOT / f"public/art/icons/{asset['name']}.webp"
        if path.exists():
            paste(utilities_sheet, path, (x, 25, 96, 96))
            paste(utilities_sheet, path, (x+112, 61, 24, 24))
        label(utilities_sheet, (x, 160), asset["name"], 18)
    utilities_sheet.save(HERE / "utility-sheet.png")
    print(f"Built {len(deliveries)} deliveries, {len(mappings)}/36 cards.", flush=True)


if __name__ == "__main__":
    build()
