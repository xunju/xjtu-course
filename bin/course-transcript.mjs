#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { extractEmbeddedTranscript, parseSrt, transcribeCourse, transcriptStatus } from '../src/course/transcript.js';

const [input, ...args] = process.argv.slice(2);
if (!input) throw new Error('usage: course-transcript <video.mp4> --out transcript.json [--transcript-file cues.srt|cues.json]');
const i = args.indexOf('--out');
if (i < 0 || !args[i + 1]) throw new Error('--out transcript.json is required');
const output = resolve(args[i + 1]);
const ti = args.indexOf('--transcript-file');
let result;
if (ti >= 0 && args[ti + 1]) {
  const transcriptFile = resolve(args[ti + 1]);
  const raw = await readFile(transcriptFile, 'utf8');
  if (transcriptFile.toLowerCase().endsWith('.srt')) {
    result = { source: 'file', segments: parseSrt(raw), reason: null, file: transcriptFile };
  } else {
    const parsed = JSON.parse(raw);
    const segments = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.segments) ? parsed.segments : []);
    result = { source: 'file', segments, reason: segments.length ? null : 'transcript file contained no segments', file: transcriptFile };
  }
} else {
  result = await extractEmbeddedTranscript(resolve(input));
}
if (!result.segments.length && process.env.DSH_ASR_BASE_URL) {
  result = await transcribeCourse(resolve(input), {
    baseUrl: process.env.DSH_ASR_BASE_URL,
    model: process.env.DSH_ASR_MODEL,
    apiKey: process.env.DSH_ASR_KEY,
    language: process.env.DSH_ASR_LANG,
  });
}
const payload = { input: resolve(input), ...result, status: transcriptStatus(result, { asrConfigured: Boolean(process.env.DSH_ASR_BASE_URL) }) };
await writeFile(output, JSON.stringify(payload, null, 2), 'utf8');
console.log(JSON.stringify({ output, ...payload.status }, null, 2));
