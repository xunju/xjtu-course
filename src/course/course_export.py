"""Export clustered course slides to per-chapter images, PDFs and Markdown."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def safe_name(value: str, fallback: str) -> str:
    text = "".join(c if c.isalnum() or c in "-_ ." else "_" for c in str(value or ""))
    return text.strip(" .") or fallback


def export(slides_file: Path, out: Path) -> dict:
    payload = json.loads(slides_file.read_text(encoding="utf-8"))
    slides = payload.get("slides", payload if isinstance(payload, list) else [])
    out.mkdir(parents=True, exist_ok=True)
    chapters: dict[str, list] = {}
    for slide in slides:
        chapter = str(slide.get("chapter") or "未分类")
        chapters.setdefault(chapter, []).append(slide)

    chapter_rows = []
    preview_items = []
    all_pdf_images = []
    for chapter_index, (chapter, items) in enumerate(chapters.items(), 1):
        chapter_dir = out / f"{chapter_index:02d}-{safe_name(chapter, 'chapter')}"
        chapter_dir.mkdir(parents=True, exist_ok=True)
        pages = []
        for slide_index, slide in enumerate(sorted(items, key=lambda x: x.get("firstSeen", 0)), 1):
            versions = slide.get("versions", [])
            for version_index, version in enumerate(versions, 1):
                source = Path(version.get("image", ""))
                if not source.is_file():
                    continue
                name = f"{slide_index:03d}-v{version_index}.jpg"
                target = chapter_dir / name
                if source.resolve() != target.resolve(): shutil.copy2(source, target)
                pages.append({"slideId": slide.get("slideId"), "versionId": version.get("versionId"),
                              "image": name, "firstSeen": version.get("firstSeen"),
                              "occurrences": version.get("occurrences", []),
                              "ocrText": version.get("ocrText", "")})
                preview_items.append((target, f"{chapter} · {slide.get('slideId')}"))
        images = [Image.open(chapter_dir / p["image"]).convert("RGB") for p in pages]
        if images:
            images[0].save(chapter_dir / "slides.pdf", save_all=True, append_images=images[1:])
            all_pdf_images.extend(images)
        lines = [f"# {chapter}", "", "| 页面 | 版本 | 首次出现 | 出现次数 |", "|---|---|---:|---:|"]
        for p in pages:
            lines.append(f"| {p['slideId']} | {p['versionId']} | {p.get('firstSeen', '')} | {len(p['occurrences'])} |")
            if p.get("ocrText"): lines.extend(["", f"**OCR**：{p['ocrText']}"])
            lines.extend(["", f"![{p['versionId']}]({p['image']})", ""])
        (chapter_dir / "index.md").write_text("\n".join(lines), encoding="utf-8")
        chapter_rows.append({"chapter": chapter, "directory": chapter_dir.name, "pages": pages})

    if all_pdf_images:
        all_pdf_images[0].save(out / "course.pdf", save_all=True, append_images=all_pdf_images[1:])
        for image in all_pdf_images:
            image.close()

    # A compact contact sheet makes manual QA possible without opening every file.
    if preview_items:
        thumb_w, thumb_h, label_h = 320, 180, 28
        cols = min(4, max(1, len(preview_items)))
        rows = (len(preview_items) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * thumb_w, rows * (thumb_h + label_h)), "white")
        draw = ImageDraw.Draw(sheet)
        for i, (image_path, label) in enumerate(preview_items):
            try:
                with Image.open(image_path) as source:
                    image = source.convert("RGB")
                    image.thumbnail((thumb_w, thumb_h))
                    x = (i % cols) * thumb_w + (thumb_w - image.width) // 2
                    y = (i // cols) * (thumb_h + label_h) + (thumb_h - image.height) // 2
                    sheet.paste(image, (x, y))
                draw.text(((i % cols) * thumb_w + 4,
                           (i // cols) * (thumb_h + label_h) + thumb_h + 5),
                          label[:48], fill="black")
            except (OSError, ValueError):
                continue
        sheet.save(out / "preview.jpg", quality=90)

    result = {"source": payload.get("source"), "chapters": chapter_rows}
    (out / "course.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("slides", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(export(args.slides, args.out), ensure_ascii=False))


if __name__ == "__main__":
    main()
