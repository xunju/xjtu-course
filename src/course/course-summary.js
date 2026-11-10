/** Build and optionally send evidence-grounded chapter summary prompts. */

import { normalizeOcrText } from './slide-versions.js';

export function chapterEvidence(chapter) {
  return (chapter?.pages ?? chapter?.slides ?? []).map((page) => ({
    id: page.versionId ?? page.slideId,
    time: page.firstSeen,
    occurrences: page.occurrences ?? [],
    text: normalizeOcrText(page.ocrText ?? ''),
  }));
}

/** Accept either a segment array or course-transcript's JSON wrapper. */
export function normalizeTranscriptPayload(payload) {
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload?.segments) ? payload.segments : [];
}

export function buildSummaryPrompt(chapter, { transcript = [] } = {}) {
  const evidence = chapterEvidence(chapter);
  const lo = Math.min(...evidence.map((x) => Number(x.time)).filter(Number.isFinite), 0);
  const hi = Math.max(...evidence.flatMap((x) => x.occurrences).filter(Number.isFinite), lo);
  const speech = transcript.filter((s) => Number(s.start ?? s.from ?? 0) <= hi
    && Number(s.end ?? s.to ?? 0) >= lo)
    .map((s) => `[${s.start ?? s.from}-${s.end ?? s.to}] ${s.text ?? s.content ?? ''}`).join('\n');
  return [
    '你是课程笔记整理助手。只根据给出的 PPT OCR 和老师转录回答；证据不足时明确写“未能从材料确认”，不要补写。',
    `章节：${chapter.chapter ?? '未分类'}`,
    '', 'PPT 页面证据：', JSON.stringify(evidence, null, 2),
    '', '老师讲解转录：', speech || '(无转录；当前仅能根据 PPT/OCR 总结，不要推断老师未提供的讲解)',
    '', '请输出：',
    '1. 本章概要（3-6句）', '2. 知识点列表（按 PPT 顺序）',
    '3. 老师强调或布置的内容', '4. 仍需人工核对的术语、公式或 OCR 错误',
  ].join('\n');
}

export async function callSummaryModel(prompt, {
  endpoint, model = 'gpt-4o-mini', apiKey, wireApi = 'chat', fetchImpl = fetch,
} = {}) {
  if (!endpoint) throw new Error('summary endpoint is required');
  const base = endpoint.replace(/\/$/, '');
  const responses = String(wireApi).toLowerCase() === 'responses';
  const url = `${base}/${responses ? 'responses' : 'chat/completions'}`;
  const body = responses
    ? { model, input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }], temperature: 0.1 }
    : { model, temperature: 0.1, messages: [{ role: 'user', content: prompt }] };
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`summary model HTTP ${response.status}`);
  const data = await response.json();
  const text = responses
    ? (data?.output_text ?? data?.output?.flatMap((item) => item.content ?? []).map((item) => item.text).filter(Boolean).join('\n'))
    : data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('summary model returned no text');
  return text;
}
