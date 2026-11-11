#!/usr/bin/env node
/** Local HTTP bridge for the MV3 extension. It never accepts credentials. */
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const value = (flag, fallback) => { const i = args.indexOf(flag); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const port = Number(value('--port', 8765));
const cdpPort = Number(value('--cdp-port', 9333));
const outRoot = resolve(value('--out', './xjtu-course-output'));
const cacheRoot = resolve(value('--cache', './xjtu-course-cache'));
const jobs = new Map();

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' });
  res.end(JSON.stringify(body));
}
async function body(req) {
  let raw = ''; for await (const chunk of req) raw += chunk;
  if (raw.length > 1_000_000) throw new Error('request body too large');
  try { return raw ? JSON.parse(raw) : {}; } catch { throw new Error('invalid JSON body'); }
}
function sampling(value) {
  const s = value && typeof value === 'object' ? value : {};
  const number = (key, fallback, min, max) => {
    const n = Number(s[key] ?? fallback); if (!Number.isFinite(n) || n < min || n > max) throw new Error(`invalid sampling.${key}`); return n;
  };
  return {
    interval: number('interval', 0.3, 0.03, 60), threshold: number('threshold', 0.03, 0, 1),
    versionVisual: number('versionVisual', 0.999, 0, 1), versionText: number('versionText', 0.98, 0, 1),
    slideVisual: number('slideVisual', 0.999, 0, 1), slideText: number('slideText', 0.99, 0, 1),
  };
}
function argsForJob(request) {
  const page = request.page ?? {};
  const cid = String(page.courseId ?? '');
  if (!/^\d+$/.test(cid)) throw new Error('page.courseId is required');
  const s = sampling(request.sampling);
  const argv = ['bin/xjtu-course-batch.mjs', '--port', String(cdpPort), '--course', cid,
    '--out', outRoot, '--cache', cacheRoot, '--interval', String(s.interval), '--threshold', String(s.threshold),
    '--version-visual', String(s.versionVisual), '--version-text', String(s.versionText),
    '--slide-visual', String(s.slideVisual), '--slide-text', String(s.slideText),
    '--max-retries', '3'];
  if (request.ocr === false) argv.push('--no-ocr');
  if (request.allPages) argv.push('--all-pages');
  if (request.deleteVideo) argv.push('--delete-video');
  if (!request.allPages && request.mode === 'activity' && /^\d+$/.test(String(page.lessonId ?? ''))) argv.push('--lesson', String(page.lessonId), '--activity-url', String(page.url || ''), '--current-page');
  return argv;
}
function startJob(request) {
  const requestedCourse = String(request.page?.courseId ?? '');
  const requestedLesson = String(request.page?.lessonId ?? '');
  const requestedSampling = sampling(request.sampling);
  for (const existing of jobs.values()) {
    const r = existing.request ?? {};
    if (['queued', 'running'].includes(existing.status)
      && String(r.courseId) === requestedCourse && String(r.lessonId ?? '') === requestedLesson
      && r.ocr === (request.ocr !== false)
      && JSON.stringify(r.sampling) === JSON.stringify(requestedSampling)) {
      return { jobId: existing.id, status: existing.status, reused: true };
    }
  }
  const id = randomUUID(); const commandArgs = argsForJob(request);
  const job = { id, status: 'queued', createdAt: new Date().toISOString(), request: { mode: request.mode, allPages: Boolean(request.allPages), deleteVideo: Boolean(request.deleteVideo), ocr: request.ocr !== false, sampling: requestedSampling, courseId: request.page.courseId, lessonId: request.page.lessonId ?? null }, logs: [], items: {}, progress: { completed: 0, failed: 0, phase: 'queued' } };
  jobs.set(id, job);
  const child = spawn(process.execPath, commandArgs, { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  job.pid = child.pid; job.status = 'running'; job.progress = { ...job.progress, phase: 'starting', status: 'running' };
  const append = (chunk) => {
    const lines = String(chunk).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      job.logs.push(line); if (job.logs.length > 100) job.logs.shift();
      const done = line.match(/^\[done\]\s+(\S+)\s*(.*)$/);
      const failed = line.match(/^\[failed\]\s+(\S+)\s*:\s*(.*)$/);
      if (done) { job.progress.completed += 1; job.current = { key: done[1], title: done[2] }; }
      if (failed) { job.progress.failed += 1; job.progress.phase = 'failed'; job.current = { key: failed[1], error: failed[2] }; }
      if (/^\[merged\]/.test(line)) job.progress.merged = true;
      const progressLine = line.match(/^\[progress\]\s+(.+)$/);
      if (progressLine) {
        try {
          const p = JSON.parse(progressLine[1]);
          job.progress = { ...job.progress, ...p };
          if (p.lessonId) job.items[String(p.lessonId)] = { ...(job.items[String(p.lessonId)] || {}), ...p };
          if (Number.isFinite(p.bytes) && Number.isFinite(p.totalBytes) && p.totalBytes > 0) {
            job.progress.downloadPercent = Math.min(100, Math.round(p.bytes / p.totalBytes * 100));
            if (/^(downloading|capture-)/i.test(String(p.phase || ''))) job.progress.percent = job.progress.downloadPercent;
          }
        } catch { /* keep raw log when progress payload is malformed */ }
      }
      if (!progressLine && !done && !failed && /error|exception|failed|超时|未发现/i.test(line)) {
        job.progress.phase = 'failed';
        job.current = { error: line };
      }
    }
  };
  child.stdout.on('data', append); child.stderr.on('data', append);
  child.on('error', (error) => { job.status = 'failed'; job.error = error.message; });
  child.on('close', (code, signal) => { if (job.status !== 'cancelled') { job.status = code === 0 && job.progress.failed === 0 ? 'completed' : 'failed'; if (job.status === 'failed') { job.progress.phase = 'failed'; job.current = job.current || { error: `批处理进程退出，代码 ${code}` }; } } job.exitCode = code; job.signal = signal; job.finishedAt = new Date().toISOString(); });
  return { jobId: id, status: job.status };
}

await mkdir(outRoot, { recursive: true }); await mkdir(cacheRoot, { recursive: true });
const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { json(res, 204, {}); return; }
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    if (req.method === 'GET' && url.pathname === '/health') { json(res, 200, { ok: true, service: 'xjtu-extension-server', version: 1 }); return; }
    if (req.method === 'GET' && url.pathname === '/v1/jobs') { json(res, 200, [...jobs.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 20)); return; }
    if (req.method === 'POST' && url.pathname === '/v1/jobs') { json(res, 202, startJob(await body(req))); return; }
    const match = url.pathname.match(/^\/v1\/jobs\/([^/]+)$/);
    if (req.method === 'GET' && match) { const job = jobs.get(match[1]); if (!job) { json(res, 404, { error: 'job not found' }); return; } json(res, 200, job); return; }
    const cancel = url.pathname.match(/^\/v1\/jobs\/([^/]+)\/cancel$/);
    if (req.method === 'POST' && cancel) {
      const job = jobs.get(cancel[1]);
      if (!job) { json(res, 404, { error: 'job not found' }); return; }
      if (job.status === 'running' && job.pid) { process.kill(job.pid); job.status = 'cancelled'; job.cancelledAt = new Date().toISOString(); }
      json(res, 202, job); return;
    }
    json(res, 404, { error: 'not found' });
  } catch (error) { json(res, 400, { error: error.message }); }
});
server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ service: 'xjtu-extension-server', port, cdpPort, out: outRoot, cache: cacheRoot })));

