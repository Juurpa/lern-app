"""Rendert alle Folienseiten aus data/decks.json als WebP nach private-assets/slides/<deck>/<NNN>.webp
und zusätzlich jede Ausschnitt-Referenz (deck:page@x0,y0,x1,y1) aus den Datendateien.

private-assets/ ist gitignored: die Folien sind urheberrechtlich geschützt (Radar-Deck: "DISTRIBUTION
PROHIBITED") und werden nur über den Worker mit Geräteschlüssel ausgeliefert, nie über GitHub Pages.

Aufruf (aus lern-app/):  python tools/render-slides.py [--only-crops] [--force]
"""
import io
import json
import re
import sys
from pathlib import Path

import fitz
from PIL import Image

APP = Path(__file__).resolve().parent.parent
ROOT = APP.parent  # Klausuren/ – dort liegen die PDFs (decks.json-Pfade sind relativ dazu)
OUT = APP / "private-assets" / "slides"
WIDTH = 1400
CROP_MAX = 1400
QUALITY = 72
REF = re.compile(r"^([a-z0-9-]+):(\d+)(?:@([\d.]+),([\d.]+),([\d.]+),([\d.]+))?$")


def page_file(deck, page, crop=None):
    name = f"{page:03d}" + (f"@{'_'.join(crop)}" if crop else "")
    return OUT / deck / f"{name}.webp"


def save(pix, target):
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    target.parent.mkdir(parents=True, exist_ok=True)
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=QUALITY, method=6)
    target.write_bytes(buf.getvalue())


def collect_refs():
    refs = set()

    def walk(x):
        if isinstance(x, dict):
            for k, v in x.items():
                if k in ("slides", "frontSlides") and isinstance(v, list):
                    refs.update(r for r in v if isinstance(r, str))
                else:
                    walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)

    for f in (APP / "data").glob("*.json"):
        walk(json.loads(f.read_text(encoding="utf-8")))
    return refs


def main():
    force = "--force" in sys.argv
    only_crops = "--only-crops" in sys.argv
    decks = {d["id"]: d for d in json.loads((APP / "data" / "decks.json").read_text(encoding="utf-8"))}
    docs = {}

    def doc(deck):
        if deck not in docs:
            docs[deck] = fitz.open(ROOT / decks[deck]["file"])
        return docs[deck]

    rendered = skipped = 0
    if not only_crops:
        for deck_id, d in decks.items():
            for p in range(1, d["pages"] + 1):
                target = page_file(deck_id, p)
                if target.exists() and not force:
                    skipped += 1
                    continue
                page = doc(deck_id)[p - 1]
                z = WIDTH / page.rect.width
                save(page.get_pixmap(matrix=fitz.Matrix(z, z), alpha=False), target)
                rendered += 1
            print(f"{deck_id}: {d['pages']} Seiten", flush=True)

    crops = bad = 0
    for ref in sorted(collect_refs()):
        m = REF.match(ref)
        if not m or m.group(1) not in decks:
            print(f"UNGÜLTIG: {ref}")
            bad += 1
            continue
        if not m.group(3):
            continue
        deck_id, p = m.group(1), int(m.group(2))
        raw = m.group(3, 4, 5, 6)
        x0, y0, x1, y1 = map(float, raw)
        target = page_file(deck_id, p, raw)
        if target.exists() and not force:
            continue
        page = doc(deck_id)[p - 1]
        r = page.rect
        clip = fitz.Rect(r.x0 + x0 * r.width, r.y0 + y0 * r.height, r.x0 + x1 * r.width, r.y0 + y1 * r.height)
        z = min(CROP_MAX / clip.width, 4.0)
        save(page.get_pixmap(matrix=fitz.Matrix(z, z), clip=clip, alpha=False), target)
        crops += 1

    print(f"fertig: {rendered} Seiten gerendert, {skipped} übersprungen, {crops} Ausschnitte, {bad} ungültige Referenzen")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
