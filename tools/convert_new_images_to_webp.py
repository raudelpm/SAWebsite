#!/usr/bin/env python3
"""
Convert remaining raster images (jpg/jpeg/png) in Website/public/ that do NOT
already have a .webp counterpart, then rewrite references in HTML/CSS/JS to
point at the new .webp files.

Safe to re-run: only processes images that have no .webp twin yet.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
WEBSITE = ROOT / "Website"
PUBLIC = WEBSITE / "public"

sys.path.insert(0, str(WEBSITE))
from optimize_images_webp import convert_one  # type: ignore

RASTER_EXTS = {".jpg", ".jpeg", ".png"}
SCAN_DIRS = [WEBSITE]
SCAN_EXTS = {".html", ".css", ".js", ".json", ".xml"}
TARGET_KB = 200


def needs_conversion(p: Path) -> bool:
    if p.suffix.lower() not in RASTER_EXTS:
        return False
    return not p.with_suffix(".webp").exists()


def encode_variants(name: str) -> list[str]:
    """Different ways a file name may appear in HTML/CSS/JS sources."""
    out = {name}
    out.add(name.replace(" ", "%20"))
    out.add(quote(name, safe=""))
    return [v for v in out if v]


def replace_refs(text: str, old_name: str, new_name: str) -> tuple[str, int]:
    total = 0
    for old in encode_variants(old_name):
        new = old.replace(old_name.rsplit(".", 1)[0] + "." + old_name.rsplit(".", 1)[1],
                          new_name.rsplit(".", 1)[0] + ".webp") \
                 if old == old_name else \
                 old.replace(old.rsplit(".", 1)[0] + "." + old.rsplit(".", 1)[1],
                             old.rsplit(".", 1)[0] + ".webp")
        if old == new:
            continue
        if old in text:
            count = text.count(old)
            text = text.replace(old, new)
            total += count
    return text, total


def main() -> None:
    pending = [p for p in sorted(PUBLIC.iterdir()) if p.is_file() and needs_conversion(p)]
    if not pending:
        print("No raster images need conversion. Everything already has a .webp twin.")
        return

    print(f"Found {len(pending)} images without .webp twin:\n")
    converted: list[tuple[Path, Path]] = []
    for src in pending:
        res = convert_one(src, TARGET_KB)
        tag = "OK  " if res.ok else "WARN"
        print(
            f"{tag} {res.src.name} -> {res.dst.name} | "
            f"{res.before_bytes/1024:.1f}KB -> {res.after_bytes/1024:.1f}KB | "
            f"q={res.quality} | {res.size[0]}x{res.size[1]} | {res.note}"
        )
        if res.dst.exists():
            converted.append((src, res.dst))

    if not converted:
        print("\nNothing was converted; aborting rewrite.")
        return

    print("\nUpdating references in HTML/CSS/JS...")
    changed_files = 0
    total_replacements = 0
    scan_files: list[Path] = []
    for d in SCAN_DIRS:
        for ext in SCAN_EXTS:
            scan_files.extend(d.rglob(f"*{ext}"))

    for f in scan_files:
        if "node_modules" in f.parts or ".vercel" in f.parts:
            continue
        try:
            text = f.read_text(encoding="utf-8")
        except Exception:
            continue
        orig = text
        file_replacements = 0
        for src, dst in converted:
            old_name = src.name
            new_name = dst.name
            for old in encode_variants(old_name):
                new = old[: -len(src.suffix)] + ".webp"
                if old in text:
                    n = text.count(old)
                    text = text.replace(old, new)
                    file_replacements += n
        if text != orig:
            f.write_text(text, encoding="utf-8")
            changed_files += 1
            total_replacements += file_replacements
            rel = f.relative_to(ROOT)
            print(f"  patched {rel}  ({file_replacements} refs)")

    print(f"\nDone. {len(converted)} images converted, "
          f"{total_replacements} references updated across {changed_files} files.")


if __name__ == "__main__":
    main()
