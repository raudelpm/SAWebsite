#!/usr/bin/env python3
from pathlib import Path

from optimize_images_webp import convert_one


MISSING = [
    "Photo 4.jpg",
    "Photo 5.jpg",
    "Photo 14.jpg",
    "Photo 20.jpg",
    "Photo 21.jpg",
    "Photo 34.jpg",
]


def main() -> None:
    here = Path(__file__).resolve().parent
    pub = here / "public"
    target_kb = 200

    for name in MISSING:
        src = pub / name
        if not src.exists():
            print(f"skip (missing): {name}")
            continue
        res = convert_one(src, target_kb)
        print(
            f"{'OK' if res.ok else 'WARN'} {res.src.name} -> {res.dst.name} | "
            f"{res.before_bytes/1024:.1f}KB -> {res.after_bytes/1024:.1f}KB | q={res.quality} | {res.size[0]}x{res.size[1]} | {res.note}"
        )


if __name__ == "__main__":
    main()

