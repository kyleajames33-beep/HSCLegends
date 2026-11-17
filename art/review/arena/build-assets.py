"""Build original grid-authored tiles, export saved AI sprites, and assemble review art.

Run from any directory with Pillow and CairoSVG. No app source is read or written.
Generated PNG masters remain unchanged; only crop, scale and transparent padding
are applied to exported sprites. Tile SVGs are editable production sources.
"""
from pathlib import Path
import hashlib
import io
import json

import cairosvg
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
MASTER = ROOT / "art/masters/arena"
PUBLIC = ROOT / "public/art/arena"
BG = "#0E1020"
INK = "#07080F"
DIM = "#9A9CC0"
WHITE = "#F2F2FA"
TILE = 48


def svg(body):
    return '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">'+body+'</svg>\n'


def floor(detail=""):
    # All four outermost rows/columns are identical between ALL floor variants.
    return ('<path fill="#171A31" d="M0 0H48V48H0Z"/>'
            '<path fill="#242A42" d="M3 3H45V45H3Z"/>'
            '<path fill="#2C334E" d="M3 3H45L42 6H6V42L3 45Z"/>'
            '<path fill="#111526" d="M45 3V45H3L6 42H42V6Z"/>'
            '<path fill="#20253B" d="M6 6H42V42H6Z"/>'+detail)


def wall_path(d):
    # Symmetric cross-section; ports connect at centre=24 with 28px total width.
    return ''.join(f'<path d="{d}" fill="none" stroke="{c}" stroke-width="{w}" stroke-linejoin="miter" stroke-linecap="butt"/>'
                   for c, w in [(INK, 28), ("#53607E", 24), ("#303951", 20), ("#222A42", 12), ("#3D4866", 2)])


def tile_sources():
    result = {
        "floor-plain": (floor('<path d="M10 12H22M10 15H16M32 36H38" stroke="#303852" stroke-width="1"/>'),
                        "Quiet walkable metal floor; neutral panel with recessed seams."),
        "floor-vent": (floor('<path d="M12 11H36V37H12Z" fill="#111526" stroke="#39425D" stroke-width="2"/>'+''.join(f'<path d="M15 {y}H33" stroke="#3A435D" stroke-width="2"/>' for y in range(15, 36, 4))),
                       "Walkable ventilation-grille floor variant; same edge profile as plain."),
        "floor-conduit": (floor('<path d="M13 10H35V16H28V38H20V16H13Z" fill="#101426"/><path d="M15 12H33M24 14V36" stroke="#4B5675" stroke-width="2"/>'),
                          "Walkable recessed service-conduit floor variant; same edge profile."),
        "wall-straight": (wall_path('M24 -2V50'),
                          "Solid wall top; canonical north/south ports. Rotate by 90 degrees for east/west."),
        "wall-corner": (wall_path('M24 -2V24H50'),
                        "Solid wall top; canonical north-to-east elbow. Rotate in 90-degree steps."),
        "wall-end": (wall_path('M24 20V50')+'<path d="M10 22V18L16 12H32L38 18V22Z" fill="#303951" stroke="#07080F" stroke-width="2"/><path d="M16 16H32" stroke="#53607E" stroke-width="2"/>',
                     "Solid wall end; canonical south connection, capped at north. Rotate in 90-degree steps."),
        "doorway": (wall_path('M-2 24H8')+wall_path('M40 24H50')+'<path d="M8 12H11V36H8ZM37 12H40V36H37Z" fill="#53607E" stroke="#07080F" stroke-width="1"/><path d="M13 12H35M13 36H35" fill="none" stroke="#49536F" stroke-width="1"/>',
                    "Open north/south doorway; west/east wall ports, 24px clear centre passage. Transparent overlay on floor."),
        "hazard-floor": (floor('<path d="M10 10H38V38H10Z" fill="#391D33" stroke="#07080F" stroke-width="2"/>'+''.join(f'<path d="M{x} 12L{x+10} 36" stroke="#E8445F" stroke-width="4"/>' for x in [13, 23])+'<path d="M9 9H39V39H9Z" fill="none" stroke="#9A9CC0" stroke-width="1"/>'),
                         "Danger floor, red diagonal stripes and pale perimeter; render damage rules in code."),
    }
    for team, colour in [("blue", "#2F7BEA"), ("orange", "#FF6A2B")]:
        result[f"team-base-{team}"] = (floor(f'<path d="M14 8H34L40 14V34L34 40H14L8 34V14Z" fill="#121729" stroke="{colour}" stroke-width="3"/><path d="M24 14L34 24L24 34L14 24Z" fill="{colour}"/><path d="M24 18L30 24L24 30L18 24Z" fill="#171A31"/><path d="M12 12H18M30 36H36" stroke="#F2F2FA" stroke-width="2"/>'),
                                                f"{team.title()} team spawn/base floor pad, one 48px tile; repeat for larger base zones.")
    return result


def write_web(image, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="WEBP", lossless=True, method=6, exact=True)


def meaningful_bbox(image):
    box = image.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    assert box
    return (max(0, box[0]-4), max(0, box[1]-4), min(image.width, box[2]+4), min(image.height, box[3]+4))


def export_box(asset):
    name = asset["name"]
    if asset["group"] == "players":
        return (66, 66) if "knocked-out" in name else (52, 64)
    if asset["group"] == "minions":
        return (44, 44)
    return {"reactor-neutral": (80, 80), "reactor-blue": (80, 80), "reactor-orange": (80, 80),
            "question-terminal-idle": (64, 54), "question-terminal-active": (64, 54),
            "energy-pickup": (32, 32), "shield-barrier": (80, 20),
            "neutraliser-projectile": (16, 42), "hit-spark": (46, 46),
            "capture-pulse-ring": (54, 54)}[name]


def build():
    manifest_path = HERE / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    assets = [a for a in manifest["assets"] if a["group"] != "tiles"]
    tile_records = []
    for name, (body, purpose) in tile_sources().items():
        source = MASTER / "tiles" / (name+".svg")
        source.parent.mkdir(parents=True, exist_ok=True)
        source.write_text(svg(body))
        master = source.with_suffix(".png")
        cairosvg.svg2png(url=str(source), write_to=str(master), output_width=1152, output_height=1152)
        image = Image.open(io.BytesIO(cairosvg.svg2png(url=str(source), output_width=48, output_height=48))).convert("RGBA")
        target = PUBLIC / "tiles" / (name+".webp")
        write_web(image, target)
        tile_records.append(dict(group="tiles", name=name, size=48, date="2026-11-17", tool="Original SVG geometry + CairoSVG", model=None,
                                 prompt=None, brief=purpose, source=str(source.relative_to(ROOT)),
                                 master=str(master.relative_to(ROOT)), master_sha256=hashlib.sha256(master.read_bytes()).hexdigest(),
                                 delivery=str(target.relative_to(ROOT)), bytes=target.stat().st_size,
                                 anchor=[0, 0], ports=({"wall-straight": "NS", "wall-corner": "NE", "wall-end": "S", "doorway": "WE"}.get(name))))

    # Related states share one crop rectangle and scaling so toggles do not jump.
    families = [["operative-blue", "operative-orange"],
                ["operative-blue-knocked-out", "operative-orange-knocked-out"],
                ["question-terminal-idle", "question-terminal-active"],
                ["reactor-neutral", "reactor-blue", "reactor-orange"]]
    images = {a["name"]: Image.open(ROOT / a["master"]).convert("RGBA") for a in assets}
    boxes = {n: meaningful_bbox(im) for n, im in images.items()}
    for family in families:
        assert len({images[n].size for n in family}) == 1
        union = (min(boxes[n][0] for n in family), min(boxes[n][1] for n in family),
                 max(boxes[n][2] for n in family), max(boxes[n][3] for n in family))
        for n in family:
            boxes[n] = union
    for asset in assets:
        name = asset["name"]
        illustration = ImageOps.contain(images[name].crop(boxes[name]), export_box(asset), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (asset["size"], asset["size"]))
        canvas.alpha_composite(illustration, ((canvas.width-illustration.width)//2, (canvas.height-illustration.height)//2))
        target = PUBLIC / asset["group"] / (name+".webp")
        write_web(canvas, target)
        asset.update(delivery=str(target.relative_to(ROOT)), bytes=target.stat().st_size,
                     crop=list(boxes[name]), content_box=list(canvas.getchannel("A").getbbox()),
                     anchor=[0.5, 0.5], master_sha256=hashlib.sha256((ROOT / asset["master"]).read_bytes()).hexdigest())
    manifest["assets"] = assets + tile_records
    manifest["notes"] = "Exact 48px world grid; sprites centre-anchored, tiles top-left anchored; rotate canonical tile ports by multiples of 90 degrees. All delivered as lossless WebP; sprites/overlays RGBA, opaque floor exports decode as RGB. Floors intentionally opaque, wall/door overlays transparent outside footprint."
    manifest_path.write_text(json.dumps(manifest, indent=2)+"\n")
    review(manifest)
    print(f"Built {len(assets)} generated sprites + {len(tile_records)} authored tiles; arena-sheet.png and sample-map.png.")


def font(size, bold=False):
    return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans'+('-Bold' if bold else '')+'.ttf', size)


def label(canvas, xy, text, size=18, fill=WHITE, bold=False):
    ImageDraw.Draw(canvas).text(xy, text, font=font(size, bold), fill=fill)


def read(group, name):
    return Image.open(PUBLIC / group / (name+".webp")).convert("RGBA")


def review(manifest):
    # This is a review composition only, not a shipped game map or collision spec.
    room = Image.new("RGBA", (24*TILE, 14*TILE), BG)
    for y in range(14):
        for x in range(24):
            name = "floor-plain"
            if (x*7+y*11) % 17 == 0: name = "floor-vent"
            if x in [6, 17] and 2 <= y <= 11: name = "floor-conduit"
            if x in [10, 11, 12, 13] and y in [2, 11]: name = "hazard-floor"
            if x in [2, 3, 4] and y in [5, 6, 7, 8]: name = "team-base-blue"
            if x in [19, 20, 21] and y in [5, 6, 7, 8]: name = "team-base-orange"
            room.alpha_composite(read("tiles", name), (x*TILE, y*TILE))
    placements = []

    def tile(name, x, y, angle=0):
        room.alpha_composite(read("tiles", name).rotate(angle), (x*TILE, y*TILE))
        placements.append(dict(group="tiles", name=name, tile=[x, y], rotation_ccw=angle))

    # Outer wall loop uses the same canonical corner rotated to its four ports.
    tile("wall-corner", 0, 0, 270)
    tile("wall-corner", 23, 0, 180)
    tile("wall-corner", 23, 13, 90)
    tile("wall-corner", 0, 13, 0)
    for x in range(1, 23):
        tile("wall-straight", x, 0, 90)
        tile("wall-straight", x, 13, 90)
    for y in range(1, 13):
        tile("wall-straight", 0, y)
        tile("wall-straight", 23, y)
    # Short obstacles leave generous navigable lanes around the centre objective.
    for y in [3, 10]:
        for start in [7, 14]:
            tile("wall-end", start, y, 90)
            tile("wall-straight", start+1, y, 90)
            tile("doorway", start+2, y)
            tile("wall-end", start+3, y, 270)

    def actor(group, name, x, y, angle=0):
        image = read(group, name).rotate(angle, resample=Image.Resampling.BICUBIC)
        pos = (round(x*TILE-image.width/2), round(y*TILE-image.height/2))
        room.alpha_composite(image, pos)
        placements.append(dict(group=group, name=name, centre_tiles=[x, y], rotation_ccw=angle))

    actor("objects", "reactor-neutral", 12, 7)
    actor("objects", "reactor-blue", 4, 3)
    actor("objects", "reactor-orange", 20, 11)
    actor("objects", "question-terminal-active", 7, 6)
    actor("objects", "question-terminal-idle", 17, 8)
    actor("objects", "shield-barrier", 12, 9.1)
    for x, y in [(9, 8), (15, 6), (5, 10)]: actor("objects", "energy-pickup", x, y)
    actor("players", "operative-blue", 4, 6.6)
    actor("players", "operative-blue", 9, 5.8)
    actor("players", "operative-orange", 20, 6.8, 180)
    actor("players", "operative-orange", 14.7, 8.2, 180)
    actor("players", "operative-orange-knocked-out", 18.2, 4.7, 90)
    actor("players", "operative-blue-knocked-out", 5, 8.7, 270)
    for name, x, y in [("biology", 8.3, 8.4), ("chemistry", 15.8, 5.2), ("physics", 10, 7.3),
                       ("maths-standard", 16, 9.5), ("maths-advanced", 8.8, 2.2), ("maths-extension-1", 14.4, 11.6)]:
        actor("minions", name+"-minion", x, y)
    actor("fx", "neutraliser-projectile", 9, 4.7)
    actor("fx", "hit-spark", 16.3, 6.5)
    # Capture pulse is drawn below/around the reactor at expanded runtime scale.
    pulse = read("fx", "capture-pulse-ring").resize((132, 132), Image.Resampling.LANCZOS)
    room.alpha_composite(pulse, (12*TILE-66, 7*TILE-66))
    room.convert("RGB").save(HERE / "sample-map.png")
    (HERE / "sample-map.json").write_text(json.dumps(dict(grid=48, width_tiles=24, height_tiles=14, placements=placements,
                                                         note="Review composition; not a collision specification. Base floor assignment is deterministic in build-assets.py."), indent=2)+"\n")

    sheet = Image.new("RGB", (1600, 2200), BG)
    label(sheet, (40, 26), "HSC LEGENDS / TOP-DOWN ARENA", 32, bold=True)
    label(sheet, (40, 78), "48px world grid / orthographic overhead / native delivery scale in sample map", 20, DIM)
    sheet.paste(room.convert("RGB"), (40, 140))
    label(sheet, (1225, 145), "SCALE CHECK", 22, bold=True)
    label(sheet, (1225, 190), "1 tile = 48px", 18, DIM)
    label(sheet, (1225, 224), "Player canvas 96px", 18, DIM)
    label(sheet, (1225, 258), "Objects 96px", 18, DIM)
    label(sheet, (1225, 292), "Minions / FX 64px", 18, DIM)
    label(sheet, (1225, 352), "PLAYER AT 48px", 18, bold=True)
    for i, name in enumerate(["operative-blue", "operative-orange"]):
        im = read("players", name).resize((48, 48), Image.Resampling.LANCZOS)
        sheet.paste(im, (1235+i*100, 400), im)
    label(sheet, (1225, 500), "All sprites face north.", 17, DIM)
    label(sheet, (1225, 532), "Map shows rotations.", 17, DIM)
    label(sheet, (1225, 580), "Dark / angular / 16–18", 17, DIM)
    label(sheet, (1225, 612), "No isometric camera.", 17, DIM)
    label(sheet, (40, 840), "PLAYERS / 96px + 48px / ACTIVE + KNOCKED OUT", 23, bold=True)
    names = ["operative-blue", "operative-orange", "operative-blue-knocked-out", "operative-orange-knocked-out"]
    for i, name in enumerate(names):
        x = 40+i*385
        im = read("players", name)
        sheet.paste(im, (x+12, 885), im)
        im = im.resize((48, 48), Image.Resampling.LANCZOS)
        sheet.paste(im, (x+140, 910), im)
        label(sheet, (x, 995), name, 15, DIM)
    label(sheet, (40, 1055), "TILES / 48px NATIVE + 96px DETAIL", 23, bold=True)
    for i, a in enumerate(a for a in manifest["assets"] if a["group"] == "tiles"):
        x = 40+i*153
        im = read("tiles", a["name"])
        sheet.paste(im, (x+24, 1105), im)
        detail = im.resize((96, 96), Image.Resampling.NEAREST)
        sheet.paste(detail, (x, 1165), detail)
        label(sheet, (x, 1274), a["name"], 12, DIM)
    label(sheet, (40, 1340), "OBJECTS / 96px / TERMINAL STATES + CAPTURE OWNERSHIP", 23, bold=True)
    names = ["question-terminal-idle", "question-terminal-active", "reactor-neutral", "reactor-blue", "reactor-orange", "energy-pickup", "shield-barrier"]
    for i, name in enumerate(names):
        x = 40+i*220
        im = read("objects", name)
        sheet.paste(im, (x+25, 1395), im)
        label(sheet, (x, 1510), name, 13, DIM)
    label(sheet, (40, 1580), "SUBJECT MINIONS / 64px", 23, bold=True)
    names = ["biology", "chemistry", "physics", "maths-standard", "maths-advanced", "maths-extension-1"]
    for i, name in enumerate(names):
        x = 40+i*255
        im = read("minions", name+"-minion")
        sheet.paste(im, (x+30, 1640), im)
        label(sheet, (x, 1735), name, 16, DIM)
    label(sheet, (40, 1810), "FX / 64px / SINGLE FRAMES FOR RUNTIME ANIMATION", 23, bold=True)
    for i, name in enumerate(["neutraliser-projectile", "hit-spark", "capture-pulse-ring"]):
        x = 40+i*420
        im = read("fx", name)
        sheet.paste(im, (x+35, 1865), im)
        label(sheet, (x, 1950), name, 17, DIM)
    label(sheet, (40, 2040), "30 original assets / lossless WebP / transparent overlays / opaque walkable floors", 20, DIM)
    label(sheet, (40, 2080), "PNG masters + editable tile SVGs: art/masters/arena/ / provenance: docs/ART_ASSETS.md", 19, DIM)
    label(sheet, (40, 2120), "Review composition only. App code, movement, collision and gameplay are separate integration work.", 18, DIM)
    sheet.save(ROOT / "art/review/arena-sheet.png")


if __name__ == "__main__":
    build()
