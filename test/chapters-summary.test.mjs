import test from 'node:test';
import assert from 'node:assert/strict';
import { assignChapters, chapterHeading } from '../src/course/chapters.js';
import { buildSummaryPrompt, callSummaryModel, normalizeTranscriptPayload } from '../src/course/course-summary.js';
import { normalizeOcrText } from '../src/course/slide-versions.js';

test('cleans recorder overlays from exported OCR text', () => {
  assert.equal(normalizeOcrText('2026年09月14日星期一 14:33:21 dongyi1_d301 课程内容'), '课程内容');
  assert.equal(normalizeOcrText('6年09月14日星期一15：27：21 第1章 造概述 dongyil_d3o1'), '第1章 造概述');
});

test('normalizes wrapped transcript output from course-transcript', () => {
  const segments = [{ start: 1, end: 2, text: '内容' }];
  assert.deepEqual(normalizeTranscriptPayload({ segments, status: { state: 'ready' } }), segments);
  assert.deepEqual(normalizeTranscriptPayload(segments), segments);
  assert.deepEqual(normalizeTranscriptPayload({ status: { state: 'not-configured' } }), []);
});

test('detects chapter headings and carries them forward', () => {
  assert.equal(chapterHeading('课程内容：第 2 章 词法分析'), '第2章 词法分析');
  assert.equal(chapterHeading('第1章 造概述'), '第1章 概述');
  const out = assignChapters([
    { firstSeen: 0, versions: [{ ocrText: '课程介绍' }] },
    { firstSeen: 5, versions: [{ ocrText: '第1章 概述' }] },
    { firstSeen: 10, versions: [{ ocrText: '基本概念' }] },
  ]);
  assert.deepEqual(out.map((x) => x.chapter), ['未分类', '第1章 概述', '第1章 概述']);
});

test('builds evidence prompt and calls an OpenAI-compatible endpoint', async () => {
  const prompt = buildSummaryPrompt({ chapter: '第1章', pages: [{ versionId: 's1-v1', firstSeen: 1, occurrences: [1], ocrText: '定义' }] }, {
    transcript: [{ start: 0, end: 4, text: '老师讲定义' }],
  });
  assert.match(prompt, /PPT 页面证据/);
  assert.match(prompt, /老师讲定义/);
  const result = await callSummaryModel(prompt, {
    endpoint: 'https://summary.test/v1', apiKey: 'secret',
    fetchImpl: async (url, init) => {
      assert.equal(url, 'https://summary.test/v1/chat/completions');
      assert.equal(init.headers.authorization, 'Bearer secret');
      return new Response(JSON.stringify({ choices: [{ message: { content: '摘要' } }] }), { status: 200 });
    },
  });
  assert.equal(result, '摘要');
});

test('supports the OpenAI Responses wire API used by compatible gateways', async () => {
  const result = await callSummaryModel('请总结', {
    endpoint: 'https://gateway.test/v1', model: 'gpt-5.5', wireApi: 'responses',
    fetchImpl: async (url, init) => {
      assert.equal(url, 'https://gateway.test/v1/responses');
      const body = JSON.parse(init.body);
      assert.equal(body.model, 'gpt-5.5');
      assert.equal(body.input[0].content[0].text, '请总结');
      return new Response(JSON.stringify({ output_text: '响应摘要' }), { status: 200 });
    },
  });
  assert.equal(result, '响应摘要');
});
