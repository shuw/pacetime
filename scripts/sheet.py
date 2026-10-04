# Tiles a style's four screenshots into one 2x2 contact sheet.
import sys
from PIL import Image

for style in sys.argv[1:]:
    shots = [Image.open(f"shots/{style}-{n}.png") for n in ("1-rest", "2-walk", "3-sprint", "4-back")]
    w, h = shots[0].size
    w2, h2 = w // 2, h // 2
    sheet = Image.new("RGB", (w2 * 2 + 6, h2 * 2 + 6), "white")
    for i, im in enumerate(shots):
        sheet.paste(im.resize((w2, h2)), ((i % 2) * (w2 + 6), (i // 2) * (h2 + 6)))
    sheet.save(f"shots/{style}-sheet.png")
