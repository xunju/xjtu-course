#!/usr/bin/env node
/** Capture and cache authorized XJTU LMS MP4 requests from a CDP browser. */

import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { captureXjtuMedia, pickCdpTarget, readCdpCookieHeader } from '../src/course/cdp-media.js';
import { cacheXjtuMp4 } from '../src/course/xjtu-cache.js';

const args = process.argv.slice(2);
const value = (flag, fallback) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : fallback; };
const port = Number(value('--port', 9333));
const seconds = Number(value('--seconds', 30));
const track = String(value('--track', '2'));
const out = resolve(value('--out', './xjtu-media'));
const pptOutArg = value('--ppt-out', null);
const pptOut = pptOutArg ? resolve(pptOutArg) : null;
const interval = Number(value('--interval', 0.3));
const threshold = Number(value('--threshold', 0.03));
const pattern = new RegExp(value('--target', 'xjtu\\.edu\\.cn'), 'i');
if (!Number.isFinite(port) || !Number.isFinite(seconds) || seconds <= 0) throw new Error('invalid --port or --seconds');
if (!Number.isFinite(interval) || interval <= 0 || !Number.isFinite(threshold) || threshold <= 0) throw new Error('invalid --interval or --threshold');

function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolveRun() : reject(new Error(`${command} exited ${code}`)));
  });
}

console.error(`[capture] open the logged-in player and play/seek during the next ${seconds}s`);
const result = await captureXjtuMedia({
  port, timeoutMs: seconds * 1000, targetPattern: pattern,
  onProgress: (p) => { if (p.phase === 'media') console.error(`[capture] media track=${p.track} ${p.url}`); },
});
const chosen = result.candidates.filter((x) => x.track === track);
if (chosen.length === 0) throw new Error(`no MP4 track ${track} captured; tracks seen: ${[...new Set(result.candidates.map((x) => x.track))].join(', ') || 'none'}`);
const target = pickCdpTarget(await (await import('../src/storyboard/browser-time.js')).listTargets({ port }), pattern);
const cookie = await readCdpCookieHeader(target, { host: new URL(chosen[0].url).hostname });
await mkdir(out, { recursive: true });
const seen = new Set();
const cached = [];
for (const candidate of chosen) {
  if (seen.has(candidate.url)) continue;
  seen.add(candidate.url);
  const item = await cacheXjtuMp4(candidate.url, {
    dir: out,
    trackOverride: candidate.track,
    headers: { ...(candidate.headers ?? {}), ...(cookie ? { Cookie: cookie } : {}), Referer: result.target.url },
    onProgress: (p) => { if (p.phase === 'downloaded') console.error(`[cache] ${p.meta.source} ${p.bytes} bytes`); },
  });
  cached.push({ path: item.path, bytes: item.bytes, ...item.meta });
}
if (pptOut) {
  for (const item of cached) {
    const stem = item.source?.split('/').pop()?.replace(/\.mp4$/i, '') || 'course';
    const destination = resolve(pptOut, stem);
    await run(process.execPath, [fileURLToPath(new URL('./course-ppt.mjs', import.meta.url)), item.path,
      '--out', destination, '--interval', String(interval), '--threshold', String(threshold), '--ocr']);
  }
}
console.log(JSON.stringify({ target: result.target, tracks: [...new Set(result.candidates.map((x) => x.track))], cached, pptOut }, null, 2));
