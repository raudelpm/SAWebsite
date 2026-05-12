#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import unquote


def resolve_original(pub: Path, decoded_rel_path: Path) -> Path | None:
    """
    Try exact path, then scan by stem ignoring extension for jpg/jpeg/png variants.
    """
    exact = pub / decoded_rel_path.name
    if exact.exists():
        return exact

    stem = decoded_rel_path.stem
    matches: list[Path] = []
    for p in pub.glob(stem + ".*"):
        if p.suffix.lower() in {".jpg", ".jpeg", ".png"}:
            matches.append(p)
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        # Prefer exact stem match over weird collisions.
        return sorted(matches, key=lambda x: len(x.name))[0]
    return None


def main() -> None:
    root = Path(__file__).resolve().parents[1]  # repo root
    website = root / "Website"
    idx = (website / "index.html").read_text(encoding="utf-8", errors="ignore")
    pub = website / "public"

    refs = set(re.findall(r"public/[^\s\"'>]+", idx))

    decoded_paths: list[Path] = []
    for raw in refs:
        raw = raw.split("?", 1)[0].strip()
        rel = raw[len("public/") :]
        decoded_paths.append(Path(unquote(rel)))

    stems: set[str] = set()
    for rel_path in decoded_paths:
        suffix = rel_path.suffix.lower()
        if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
            continue

        stem = rel_path.stem
        stems.add(stem)

    orig_total = 0
    webp_total = 0
    paired = 0
    missing_orig: list[str] = []
    missing_webp: list[str] = []

    for stem in sorted(stems):
        webp = pub / f"{stem}.webp"
        if not webp.exists():
            missing_webp.append(str(webp.relative_to(website)))

        # Find any jpg/jpeg/png with this stem
        orig_candidates = [
            p for p in pub.glob(stem + ".*") if p.suffix.lower() in {".jpg", ".jpeg", ".png"}
        ]
        if not orig_candidates:
            missing_orig.append(f"public/{stem}.* (jpg/jpeg/png)")
            continue

        # If multiple, pick largest by size (usually the intended asset).
        orig = max(orig_candidates, key=lambda p: p.stat().st_size)
        osize = orig.stat().st_size
        orig_total += osize

        if webp.exists():
            wsize = webp.stat().st_size
            webp_total += wsize
            paired += 1

    saved = orig_total - webp_total
    pct = (saved / orig_total * 100.0) if orig_total else 0.0

    print(f"unique_image_stems_in_index: {len(stems)}")
    print(f"paired_with_webp: {paired}")
    print(f"original_total_kb: {orig_total / 1024:.1f}")
    print(f"webp_total_kb: {webp_total / 1024:.1f}")
    print(f"saved_kb: {saved / 1024:.1f}")
    print(f"saved_percent: {pct:.1f}")
    print(f"missing_original_count: {len(missing_orig)}")
    print(f"missing_webp_count: {len(missing_webp)}")


if __name__ == "__main__":
    main()
