"""Build round 5 outlined SVG branding and raster deliveries. Requires fonttools, cairosvg, Pillow."""
from pathlib import Path
from io import BytesIO

import cairosvg
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
MASTER = ROOT / "art/masters/brand"
DELIVERY = ROOT / "public/art/brand"
DELIVERY.mkdir(parents=True, exist_ok=True)

# Simple original geometry developed from the generated round 5 concept.
# True SVG paths/polygons, without embedded bitmaps or runtime fonts.
MARK = '''<polygon fill="#07080F" points="20,0 80,0 100,23 100,72 50,100 0,72 0,23"/>
<polygon fill="#6E5BFF" points="22,4 78,4 96,25 96,70 50,96 4,70 4,25"/>
<path fill="#F2F2FA" d="M12 24 L49 46 L49 78 L12 56 Z M88 24 L51 46 L51 78 L88 56 Z"/>'''

emblem = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 256 256" role="img" aria-label="HSC Legends emblem"><g transform="translate(24 24) scale(2.08)">{MARK}</g></svg>'''
(MASTER / "hsc-legends-emblem.svg").write_text(emblem + "\n")
cairosvg.svg2png(bytestring=emblem.encode(), write_to=str(MASTER / "hsc-legends-emblem.png"), output_width=1024, output_height=1024)

font = TTFont("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
scale = 140 / 1493
cursor = 0
paths = []
for char in "HSC Legends":
    glyph_name = cmap[ord(char)]
    pen = SVGPathPen(glyphs)
    glyphs[glyph_name].draw(pen)
    data = pen.getCommands()
    if data:
        paths.append(f'<path transform="translate({cursor} 0)" d="{data}"/>')
    cursor += font["hmtx"].metrics[glyph_name][0]
    cursor += 18
width = round(340 + cursor * scale + 48)
wordmark = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="320" viewBox="0 0 {width} 320" role="img" aria-label="HSC Legends"><g transform="translate(40 40) scale(2.4)">{MARK}</g><g fill="#F2F2FA" transform="translate(340 218) scale({scale} {-scale})">{"".join(paths)}</g></svg>'''
wordmark = wordmark.replace("<g transform=", "<!--" + (MASTER / "DEJAVU-LICENSE.txt").read_text() + "--><g transform=", 1)
(MASTER / "hsc-legends-wordmark.svg").write_text(wordmark + "\n")
(DELIVERY / "hsc-legends-wordmark.svg").write_text(wordmark + "\n")
for path, output_width in [(MASTER / "hsc-legends-wordmark.png", 2400), (DELIVERY / "hsc-legends-wordmark.png", 1200)]:
    cairosvg.svg2png(bytestring=wordmark.encode(), write_to=str(path), output_width=output_width)
with Image.open(DELIVERY / "hsc-legends-wordmark.png") as image:
    image.save(DELIVERY / "hsc-legends-wordmark.webp", lossless=True, method=4, exact=True)

for name, size in [("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180), ("favicon-32.png", 32)]:
    data = cairosvg.svg2png(bytestring=emblem.encode(), output_width=size, output_height=size)
    symbol = Image.open(BytesIO(data)).convert("RGBA")
    image = Image.new("RGB", (size, size), "#0E1020")
    image.paste(symbol, (0, 0), symbol)
    image.save(ROOT / "public" / name, optimize=True)

print("Built SVG wordmark, transparent PNG/WebP copies, vector emblem masters and four app icons.")
