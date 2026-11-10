"""Merge audited lesson JPG pages into one course PDF in lesson order."""
from __future__ import annotations
import argparse
import json
import re
from pathlib import Path
from PIL import Image

def natural(path: Path):
    return [int(x) if x.isdigit() else x.lower() for x in re.split(r"(\d+)", str(path))]

def merge(root: Path, output: Path, lesson_dirs: list[Path]):
    images: list[Path] = []
    for lesson in lesson_dirs:
        course = lesson / "course.json"
        if not course.is_file():
            continue
        # Only include lessons that have passed their own export/audit stage.
        data = json.loads(course.read_text(encoding="utf-8"))
        for chapter in data.get("chapters", []):
            directory = lesson / str(chapter.get("directory", ""))
            for page in chapter.get("pages", []):
                image = directory / str(page.get("image", ""))
                if image.is_file(): images.append(image)
    images.sort(key=lambda p: natural(str(p)))
    if not images: raise RuntimeError("no audited lesson pages found")
    output.parent.mkdir(parents=True, exist_ok=True)
    converted = []
    try:
        for path in images:
            with Image.open(path) as source: converted.append(source.convert("RGB"))
        converted[0].save(output, save_all=True, append_images=converted[1:])
    finally:
        for image in converted: image.close()
    return len(images)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("root", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    # Lesson outputs may be grouped below a sampling variant directory so
    # changing interval/threshold never reuses an older export. Recursing here
    # keeps course-level merging compatible with both the legacy flat layout
    # and the variant layout.
    lessons = sorted([p.parent for p in args.root.rglob("course.json")], key=natural)
    print(json.dumps({"output": str(args.output), "pages": merge(args.root, args.output, lessons)}, ensure_ascii=False))

if __name__ == "__main__": main()
