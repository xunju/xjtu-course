"""Extract stable PPT candidate frames from an authorized course MP4.

The XJTU recording has a changing timestamp watermark and a bottom watermark.
The default crop excludes both before measuring visual change, so those overlays
do not create fake slide versions. This script only extracts evidence; OCR and
logical/version clustering happen in the Node layer.
"""

from __future__ import annotations

import argparse
import base64
import json
from pathlib import Path

import cv2
import numpy as np


def parse_crop(value: str | None, width: int, height: int) -> tuple[int, int, int, int]:
    if not value:
        # 1280x720 XJTU recordings: remove black side bars plus top/bottom overlays.
        x, y, w, h = 50, 40, min(1180, width - 50), min(640, height - 40)
    else:
        x, y, w, h = (int(v) for v in value.split(","))
    x = max(0, min(x, width - 1))
    y = max(0, min(y, height - 1))
    w = max(1, min(w, width - x))
    h = max(1, min(h, height - y))
    return x, y, w, h


def scan(video: Path, out: Path, interval: float, threshold: float, crop_arg: str | None,
         keep_every: bool = False, sequential: bool = False) -> dict:
    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        raise RuntimeError(f"cannot open video: {video}")
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0)
    count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    duration = count / fps if fps > 0 else 0
    x, y, w, h = parse_crop(crop_arg, width, height)
    out.mkdir(parents=True, exist_ok=True)
    candidates: list[dict] = []
    prev = None
    t = 0.0
    next_sample = 0.0
    index = 0
    while t < duration + 0.01:
        if sequential:
            ok, frame = cap.read()
            if not ok:
                break
            frame_time = float(cap.get(cv2.CAP_PROP_POS_MSEC) or 0) / 1000.0
            if frame_time + 1e-6 < next_sample:
                continue
            t = next_sample
            next_sample += interval
        else:
            cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
            ok, frame = cap.read()
            frame_time = t
        if not ok:
            break
        roi = frame[y:y + h, x:x + w]
        small = cv2.resize(cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY), (160, 90), interpolation=cv2.INTER_AREA)
        diff = 0.0 if prev is None else float(np.mean(cv2.absdiff(small, prev))) / 255.0
        is_candidate = prev is None or keep_every or diff >= threshold
        if is_candidate:
            image = out / f"frame-{index:06d}.jpg"
            # cv2.imwrite() can silently fail on Windows paths containing
            # Chinese characters. Encode first, then write bytes through
            # pathlib-compatible file I/O.
            ok, encoded = cv2.imencode(".jpg", roi, [cv2.IMWRITE_JPEG_QUALITY, 92])
            if not ok:
                raise RuntimeError(f"failed to encode candidate frame at {t:.3f}s")
            image.write_bytes(encoded.tobytes())
            candidates.append({
                "time": round(t, 3),
                "image": image.name,
                "change": round(diff, 6),
                "sample": base64.b64encode(small.tobytes()).decode("ascii"),
                "width": w,
                "height": h,
            })
            index += 1
        prev = small
        t += interval
    cap.release()
    manifest = {
        "source": str(video),
        "duration": round(duration, 3),
        "fps": round(fps, 6),
        "sourceSize": [width, height],
        "crop": [x, y, w, h],
        "interval": interval,
        "threshold": threshold,
        "candidates": candidates,
    }
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("video", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--interval", type=float, default=0.3)
    parser.add_argument("--threshold", type=float, default=0.03)
    parser.add_argument("--crop", default=None, help="x,y,w,h")
    parser.add_argument("--keep-every", action="store_true")
    parser.add_argument("--sequential", action="store_true", help="decode once in order; avoids random seeks for very small intervals")
    args = parser.parse_args()
    if args.interval <= 0 or args.threshold < 0:
        parser.error("interval must be > 0 and threshold must be >= 0")
    print(json.dumps(scan(args.video, args.out, args.interval, args.threshold, args.crop, args.keep_every, args.sequential),
                     ensure_ascii=False))


if __name__ == "__main__":
    main()
