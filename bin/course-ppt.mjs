#!/usr/bin/env node
/** Extract PPT candidates/versions from a local authorized course MP4. */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { clusterSlideVersions, normalizeOcrText } from '../src/course/slide-versions.js';
import { assignChapters } from '../src/course/chapters.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parse(argv) {
  const [input, ...rest] = argv;
  const outAt = rest.indexOf('--out');
  if (!input || outAt < 0 || !rest[outAt + 1]) throw new Error('usage: course-ppt <video.mp4> --out <directory> [--interval 0.3] [--threshold 0.03]');
  const value = (flag, fallback) => {
    const i = rest.indexOf(flag);
    return i >= 0 ? rest[i + 1] : fallback;
  };
  return { input: resolve(input), out: resolve(rest[outAt + 1]), interval: Number(value('--interval', 0.3)), threshold: Number(value('--threshold', 0.03)), chapter: value('--chapter', '未分类'), ocr: rest.includes('--ocr'),
    versionVisual: Number(value('--version-visual', 0.999)), versionText: Number(value('--version-text', 0.98)),
    slideVisual: Number(value('--slide-visual', 0.999)), slideText: Number(value('--slide-text', 0.99)) };
}

function run(bin, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(bin, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (x) => { stdout += x; });
    child.stderr.on('data', (x) => { stderr += x; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolveRun({ stdout, stderr }) : reject(new Error(`${bin} failed (${code}): ${stderr.slice(-1000)}`)));
  });
}

const cfg = parse(process.argv.slice(2));
await mkdir(cfg.out, { recursive: true });
const scanDir = resolve(cfg.out, 'scan');
const python = process.env.PYTHON || 'python';
// Small sampling intervals are decoded sequentially to avoid thousands of
// random seeks (especially on long LMS recordings).
const scanArgs = [resolve(ROOT, 'src/course/slide_scan.py'), cfg.input, '--out', scanDir,
  '--interval', String(cfg.interval), '--threshold', String(cfg.threshold)];
if (cfg.interval <= 1) scanArgs.push('--sequential');
await run(python, scanArgs);
if (cfg.ocr) await run(python, [resolve(ROOT, 'src/course/slide_ocr.py'), resolve(scanDir, 'manifest.json')]);
const manifest = JSON.parse(await readFile(resolve(scanDir, cfg.ocr ? 'manifest-ocr.json' : 'manifest.json'), 'utf8'));
const candidates = manifest.candidates.map((x) => ({
  ...x,
  image: resolve(scanDir, x.image),
  ocrText: normalizeOcrText(x.ocrText ?? ''),
  sample: Uint8Array.from(Buffer.from(x.sample, 'base64')),
}));
const slides = assignChapters(clusterSlideVersions(candidates, {
  versionVisual: cfg.versionVisual, versionText: cfg.versionText,
  slideVisual: cfg.slideVisual, slideText: cfg.slideText,
}), { initial: cfg.chapter });
const slidesPath = resolve(cfg.out, 'slides.json');
await writeFile(slidesPath, JSON.stringify({ source: cfg.input, slides }, null, 2), 'utf8');
await run(process.env.PYTHON || 'python', [resolve(ROOT, 'src/course/course_export.py'), slidesPath, '--out', cfg.out]);
await run(process.env.PYTHON || 'python', [resolve(ROOT, 'src/course/review_report.py'), resolve(cfg.out, 'course.json')]);
// Keep transcript state beside the slide output. With no ASR endpoint this
// records the absence of subtitles explicitly instead of silently omitting it.
await run(process.execPath, [resolve(ROOT, 'bin/course-transcript.mjs'), cfg.input, '--out', resolve(cfg.out, 'transcript.json')]);
// Always emit chapter summary files. Without an endpoint these contain the
// evidence-only prompt, so the output remains reviewable and deterministic.
await run(process.execPath, [resolve(ROOT, 'bin/course-summary.mjs'),
  resolve(cfg.out, 'course.json'), '--transcript', resolve(cfg.out, 'transcript.json')]);
console.log(JSON.stringify({ source: basename(cfg.input), candidates: candidates.length, slides: slides.length, versions: slides.reduce((n, s) => n + s.versions.length, 0), ocr: cfg.ocr, out: cfg.out }));
