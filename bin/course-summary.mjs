#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildSummaryPrompt, callSummaryModel, normalizeTranscriptPayload } from '../src/course/course-summary.js';

const [courseFile, ...args] = process.argv.slice(2);
if (!courseFile) throw new Error('usage: course-summary <course.json> [--transcript transcript.json] [--endpoint URL] [--model MODEL]');
const value = (flag, fallback) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : fallback; };
const course = JSON.parse(await readFile(resolve(courseFile), 'utf8'));
const transcriptFile = value('--transcript', null);
const transcriptPayload = transcriptFile ? JSON.parse(await readFile(resolve(transcriptFile), 'utf8')) : [];
// Accept both the plain segment array and course-transcript's object wrapper.
const transcript = normalizeTranscriptPayload(transcriptPayload);
const endpoint = value('--endpoint', process.env.COURSE_SUMMARY_ENDPOINT || null);
const model = value('--model', process.env.COURSE_SUMMARY_MODEL || 'gpt-4o-mini');
const wireApi = value('--wire-api', process.env.COURSE_SUMMARY_WIRE_API || 'chat');
const apiKey = process.env.COURSE_SUMMARY_KEY;
const outputs = [];
for (const chapter of course.chapters ?? []) {
  const prompt = buildSummaryPrompt(chapter, { transcript });
  const target = resolve(dirname(resolve(courseFile)), chapter.directory, 'summary.md');
  const text = endpoint
    ? await callSummaryModel(prompt, { endpoint, model, apiKey, wireApi })
    : `# ${chapter.chapter}\n\n> 未配置总结模型。以下是可直接提交给模型的证据提示词。\n\n~~~text\n${prompt}\n~~~\n`;
  await writeFile(target, text, 'utf8');
  outputs.push({ chapter: chapter.chapter, file: target, generated: Boolean(endpoint) });
}
console.log(JSON.stringify({ chapters: outputs }, null, 2));
