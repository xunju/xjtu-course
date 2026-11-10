"""OCR full PPT candidate frames and add text to a slide-scan manifest."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ocr_bridge import _load, _make, _rows, _run  # noqa: E402


def run(manifest_path: Path) -> dict:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    RapidOCR, engine_name = _load()
    ocr = _make(RapidOCR, engine_name)
    root = manifest_path.parent
    for candidate in manifest.get("candidates", []):
        try:
            rows = _rows(_run(ocr, engine_name, str(root / candidate["image"])))
            rows = [(text, conf) for _, text, conf in rows if text and conf >= 0.35]
            candidate["ocrText"] = " ".join(text for text, _ in rows).strip()
            candidate["ocrConfidence"] = round(sum(conf for _, conf in rows) / len(rows), 3) if rows else 0.0
        except Exception as exc:  # noqa: BLE001
            candidate["ocrText"] = ""
            candidate["ocrConfidence"] = 0.0
            candidate["ocrError"] = str(exc)[:160]
    output = manifest_path.with_name("manifest-ocr.json")
    output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    args = parser.parse_args()
    result = run(args.manifest)
    print(json.dumps({"output": str(args.manifest.with_name("manifest-ocr.json")),
                      "items": len(result.get("candidates", [])), "engine": "rapidocr"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
