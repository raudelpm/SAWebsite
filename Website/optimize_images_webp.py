#!/usr/bin/env python3
"""
Convert images in ./public to WebP under a target size (default 200KB).

- Converts: .jpg/.jpeg/.png (keeps alpha for PNG when needed)
- Skips: .webp, .gif (animated), .svg, .mp4 and other non-raster assets
- Strategy:
  1) Try WebP at original dimensions, binary-searching quality to hit size.
  2) If still too large at min quality, downscale dimensions (max 3 passes).
"""

from __future__ import annotations

import io
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Tuple

from PIL import Image

try:
    import pillow_heif  # type: ignore

    pillow_heif.register_heif_opener()
except Exception:
    # Optional: enables opening HEIC/HEIF files mislabeled as .jpg
    pass


TARGET_KB_DEFAULT = 200
MIN_QUALITY = 25
MAX_QUALITY = 92


RASTER_EXTS = {".jpg", ".jpeg", ".png"}
SKIP_EXTS = {".webp", ".gif", ".svg", ".mp4", ".mov", ".avi", ".mkv"}


@dataclass(frozen=True)
class Result:
    src: Path
    dst: Path
    ok: bool
    before_bytes: int
    after_bytes: int
    quality: int
    size: Tuple[int, int]
    note: str


def iter_images(public_dir: Path) -> Iterable[Path]:
    for p in sorted(public_dir.iterdir()):
        if not p.is_file():
            continue
        ext = p.suffix.lower()
        if ext in SKIP_EXTS:
            continue
        if ext not in RASTER_EXTS:
            continue
        yield p


def _encode_webp(img: Image.Image, quality: int) -> bytes:
    # Use method 6 for better compression; keep metadata out.
    buf = io.BytesIO()
    save_kwargs = {
        "format": "WEBP",
        "quality": int(quality),
        "method": 6,
        "optimize": True,
    }
    # Preserve alpha if present.
    if img.mode in ("RGBA", "LA") or ("transparency" in img.info):
        img = img.convert("RGBA")
    else:
        img = img.convert("RGB")
    img.save(buf, **save_kwargs)
    return buf.getvalue()


def _best_quality_under(img: Image.Image, target_bytes: int) -> Tuple[int, bytes]:
    """
    Returns (quality, data) where data <= target_bytes if possible.
    Otherwise returns (min_quality, smallest_data_tried).
    """
    lo = MIN_QUALITY
    hi = MAX_QUALITY
    best_q = lo
    best_data = _encode_webp(img, lo)

    # If even low quality is too big, still keep smallest.
    if len(best_data) > target_bytes:
        # Try a few extra low-quality points for very large images.
        for q in (MIN_QUALITY, 22, 20, 18, 15):
            if q < 5:
                continue
            data = _encode_webp(img, q)
            if len(data) < len(best_data):
                best_q, best_data = q, data
        return best_q, best_data

    # Binary search for highest quality under target.
    best_q, best_data = lo, best_data
    while lo <= hi:
        mid = (lo + hi) // 2
        data = _encode_webp(img, mid)
        if len(data) <= target_bytes:
            best_q, best_data = mid, data
            lo = mid + 1
        else:
            hi = mid - 1
    return best_q, best_data


def _downscale(img: Image.Image, factor: float) -> Image.Image:
    w, h = img.size
    nw = max(1, int(w * factor))
    nh = max(1, int(h * factor))
    if (nw, nh) == (w, h):
        return img
    return img.resize((nw, nh), Image.Resampling.LANCZOS)


def convert_one(src: Path, target_kb: int) -> Result:
    dst = src.with_suffix(".webp")
    before = src.stat().st_size
    target_bytes = target_kb * 1024

    try:
        with Image.open(src) as im:
            im.load()
            base = im

            # Pass 1: original size
            q, data = _best_quality_under(base, target_bytes)
            note = "ok" if len(data) <= target_bytes else "downscale"

            # If needed, downscale progressively until we hit target (or give up).
            if len(data) > target_bytes:
                scaled = base
                factor = 0.85
                passes = 0
                while len(data) > target_bytes and passes < 14:
                    scaled = _downscale(scaled, factor)
                    q, data = _best_quality_under(scaled, target_bytes)
                    passes += 1
                    # After first pass, keep reducing a bit more aggressively.
                    factor = 0.82 if passes < 4 else 0.78
                    if scaled.size[0] < 320 or scaled.size[1] < 320:
                        break
                base = scaled
                if len(data) <= target_bytes:
                    note = f"downscaled passes={passes}"
                else:
                    note = "min quality + downscale; still > target"

            dst.write_bytes(data)
            after = dst.stat().st_size
            ok = after <= target_bytes
            return Result(
                src=src,
                dst=dst,
                ok=ok,
                before_bytes=before,
                after_bytes=after,
                quality=q,
                size=base.size,
                note=note,
            )
    except Exception as e:
        return Result(
            src=src,
            dst=dst,
            ok=False,
            before_bytes=before,
            after_bytes=0,
            quality=0,
            size=(0, 0),
            note=f"error: {e}",
        )


def main() -> None:
    here = Path(__file__).resolve().parent
    public_dir = here / "public"
    if not public_dir.exists():
        raise SystemExit(f"public dir not found: {public_dir}")

    target_kb = int(os.environ.get("TARGET_KB", str(TARGET_KB_DEFAULT)))

    results: list[Result] = []
    for src in iter_images(public_dir):
        results.append(convert_one(src, target_kb))

    total_before = sum(r.before_bytes for r in results)
    total_after = sum(r.after_bytes for r in results if r.after_bytes)
    failures = [r for r in results if not r.ok]

    print(f"Converted {len(results)} images to WebP (target <= {target_kb}KB)")
    print(f"Total before: {total_before/1024/1024:.2f} MB")
    print(f"Total after : {total_after/1024/1024:.2f} MB")
    if total_before:
        print(f"Savings     : {(total_before-total_after)/1024/1024:.2f} MB")
    print("")

    for r in results:
        status = "OK " if r.ok else "WARN"
        print(
            f"{status} {r.src.name} -> {r.dst.name} | "
            f"{r.before_bytes/1024:.1f}KB -> {r.after_bytes/1024:.1f}KB | "
            f"q={r.quality} | {r.size[0]}x{r.size[1]} | {r.note}"
        )

    if failures:
        print("")
        print("Images still over target:")
        for r in failures:
            print(f"- {r.dst.name}: {r.after_bytes/1024:.1f}KB ({r.note})")
        raise SystemExit(2)


if __name__ == "__main__":
    main()

