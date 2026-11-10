"""Create a human-readable QA report for a course PPT extraction."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def stamp(seconds) -> str:
    try:
        value = float(seconds)
    except (TypeError, ValueError):
        return "?"
    return f"{int(value // 60):02d}:{value % 60:04.1f}"


def create(course_file: Path) -> Path:
    data = json.loads(course_file.read_text(encoding="utf-8"))
    out = course_file.with_name("review-report.md")
    lines = ["# 课程 PPT 提取检查报告", "", f"来源：`{data.get('source', '')}`", ""]
    total = 0
    for chapter in data.get("chapters", []):
        lines.extend([f"## {chapter.get('chapter', '未分类')}", "", "| 页面版本 | 首次出现 | 重复出现 | OCR 摘要 |", "|---|---:|---|---|"])
        for page in chapter.get("pages", []):
            total += 1
            occ = page.get("occurrences", [])
            text = " ".join(str(page.get("ocrText", "")).split()).replace("|", "\\|")
            if len(text) > 180: text = text[:180] + "…"
            lines.append(f"| `{page.get('versionId', '')}` | {stamp(page.get('firstSeen'))} | {', '.join(stamp(x) for x in occ)} | {text} |")
        lines.append("")
    lines.extend([f"共 {total} 个导出版本。", "", "检查重点：", "", "- 页面是否完整；", "- 重复出现的页面是否应合并；", "- 动画、批注或逐步出现的内容是否需要拆成更多版本；", "- OCR 是否影响章节识别。"])
    out.write_text("\n".join(lines), encoding="utf-8")
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("course", type=Path)
    args = parser.parse_args()
    print(create(args.course))


if __name__ == "__main__":
    main()
