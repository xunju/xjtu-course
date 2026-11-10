import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSrt, parseSrtTime, transcriptStatus } from '../src/course/transcript.js';

test('parses SRT cues and timestamps', () => {
  assert.equal(parseSrtTime('01:02:03,500'), 3723.5);
  assert.deepEqual(parseSrt('1\n00:00:01,000 --> 00:00:02,500\n第一句\n\n2\n00:00:03,000 --> 00:00:04,000\n<b>第二句</b>'), [
    { start: 1, end: 2.5, text: '第一句', source: 'embedded' },
    { start: 3, end: 4, text: '第二句', source: 'embedded' },
  ]);
});

test('distinguishes missing subtitles from configured ASR', () => {
  assert.equal(transcriptStatus({ source: 'none', segments: [] }).state, 'not-configured');
  assert.equal(transcriptStatus({ source: 'none', segments: [] }, { asrConfigured: true }).state, 'asr-required');
});
