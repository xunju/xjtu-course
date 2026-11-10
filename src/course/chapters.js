/** Deterministic chapter assignment from slide OCR and optional ASR segments. */

import { normalizeOcrText } from './slide-versions.js';

const CHAPTER = /(?:^|[\s：:，,。.!！?？])((?:第\s*[一二三四五六七八九十百\d]+\s*章|chapter\s+\d+)[^\n。；;]{0,50})/iu;

export function chapterHeading(text) {
  const value = normalizeOcrText(text);
  const match = value.match(CHAPTER);
  if (!match) return null;
  const raw = match[1].replace(/\s+/g, ' ').trim().replace(/[，,。；;]+$/, '');
  const chapter = raw.match(/^(第\s*[一二三四五六七八九十百\d]+\s*章|chapter\s+\d+)/iu)?.[1] ?? raw;
  const rest = raw.slice(chapter.length).trim();
  // Keep a short title immediately after the chapter number. Stop before
  // OCR noise from watermarks, body paragraphs, or footer text.
  let title = rest.match(/^[\p{L}\p{N}\u3400-\u9fff_-]{1,16}/u)?.[0]?.trim() ?? '';
  // Common OCR artifact on the large heading “第1章 概述”.
  title = title.replace(/^造(?=概述)/u, '');
  return title ? `${chapter.replace(/\s+/g, '')} ${title}` : chapter.replace(/\s+/g, '');
}

function transcriptAt(segments, time) {
  return (segments ?? []).filter((s) => Number(s.start ?? s.from ?? 0) <= time
    && Number(s.end ?? s.to ?? 0) >= time).map((s) => s.text ?? s.content ?? '').join(' ');
}

/** Assign a chapter to each slide without changing slide/version identity. */
export function assignChapters(slides, { transcript = [], initial = '未分类' } = {}) {
  let current = initial;
  return (slides ?? []).map((slide) => {
    const first = slide.versions?.[0] ?? slide;
    const text = `${first.ocrText ?? ''} ${transcriptAt(transcript, Number(slide.firstSeen ?? first.firstSeen ?? 0))}`;
    const heading = chapterHeading(text);
    if (heading) current = heading;
    return { ...slide, chapter: heading || (slide.chapter && slide.chapter !== '未分类' ? slide.chapter : current) };
  });
}
