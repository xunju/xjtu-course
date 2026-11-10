#!/usr/bin/env node
/** Batch XJTU LMS lessons through a user-owned, already logged-in CDP browser. */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { captureXjtuMedia, pickCdpTarget, readCdpCookieHeader } from '../src/course/cdp-media.js';
import { cacheXjtuMp4 } from '../src/course/xjtu-cache.js';
import { listTargets } from '../src/storyboard/browser-time.js';
import { cleanupLessonCache, markLessonSuccess } from '../src/course/cleanup.js';
import { pageTransitionConfirmed } from '../src/course/xjtu-pagination.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const value = (flag, fallback = null) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : fallback; };
const port = Number(value('--port', 9333));
const courseId = value('--course');
const allCourses = args.includes('--all-courses');
const out = resolve(value('--out', './xjtu-course-output'));
const cache = resolve(value('--cache', './xjtu-course-cache'));
const track = String(value('--track', '2'));
const seconds = Number(value('--seconds', 30));
const interval = Number(value('--interval', 0.3));
const threshold = Number(value('--threshold', 0.03));
const versionVisual = Number(value('--version-visual', 0.999));
const versionText = Number(value('--version-text', 0.98));
const slideVisual = Number(value('--slide-visual', 0.999));
const slideText = Number(value('--slide-text', 0.99));
const limit = Number(value('--limit', 0));
const page = Number(value('--page', 1));
const allPages = args.includes('--all-pages') || allCourses || value('--page', '') === 'all';
const lessonOnly = value('--lesson', null);
const force = args.includes('--force');
const useCurrentPage = args.includes('--current-page');
const deleteVideo = args.includes('--delete-video');
const dryRun = args.includes('--dry-run');
const maxRetries = Number(value('--max-retries', 3));
const statePath = resolve(value('--state', resolve(out, 'batch-state.json')));

if (!Number.isFinite(port) || !Number.isFinite(seconds) || seconds <= 0) throw new Error('invalid --port/--seconds');
if (!Number.isInteger(maxRetries) || maxRetries < 1) throw new Error('invalid --max-retries');
if (!courseId && !allCourses) throw new Error('use --course ID or --all-courses');

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function run(command, argv) { return new Promise((resolveRun, reject) => {
  const child = spawn(command, argv, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let stderr = ''; child.stderr.on('data', (x) => { stderr += x; });
  child.on('error', reject); child.on('close', (code) => code === 0 ? resolveRun() : reject(new Error(`${command} exited ${code}: ${stderr.slice(-1200)}`)));
}); }

function cdp(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl); let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => { let m; try { m = JSON.parse(String(event.data)); } catch { return; } if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result ?? {}); } };
  const open = new Promise((resolveOpen, reject) => { ws.onopen = resolveOpen; ws.onerror = reject; });
  const call = async (method, params = {}) => { await open; const n = ++id; return new Promise((resolveCall, reject) => { pending.set(n, { resolve: resolveCall, reject }); ws.send(JSON.stringify({ id: n, method, params })); }); };
  return { call, close: () => { try { ws.close(); } catch {} } };
}

async function currentTarget() {
  const targets = await listTargets({ port });
  const target = pickCdpTarget(targets, /xjtu\.edu\.cn/i);
  if (!target) throw new Error('没有找到 XJTU CDP 页面，请先启动带 9333 端口的 Edge 并登录');
  return target;
}

async function evaluate(target, expression) {
  const c = cdp(target); try { const r = await c.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); return r.result?.value; } finally { c.close(); }
}
async function playEmbeddedVideos(target) {
  const c = cdp(target);
  try {
    const tree = await c.call('Page.getFrameTree');
    const frames = [];
    const walk = (node) => { if (/rms-v5\.xjtu\.edu\.cn/i.test(node?.frame?.url ?? '')) frames.push(node.frame.id); for (const child of node?.childFrames ?? []) walk(child); };
    walk(tree.frameTree);
    for (const frameId of frames) {
      const world = await c.call('Page.createIsolatedWorld', { frameId, worldName: 'dsh-batch-play', grantUniveralAccess: true });
      await c.call('Runtime.evaluate', { contextId: world.executionContextId, awaitPromise: true, returnByValue: true,
        expression: "JSON.stringify([...document.querySelectorAll('button[aria-label*=播放],.mvp-toggle-play')].map(b => { b.click(); return b.getAttribute('aria-label'); }))" });
      await c.call('Runtime.evaluate', { contextId: world.executionContextId, awaitPromise: true, returnByValue: true,
        expression: "JSON.stringify([...document.querySelectorAll('video')].map(v => { const p=v.play(); return {src:v.currentSrc||v.src, play:!!p}; }))" });
    }
  } finally { c.close(); }
}
async function navigate(target, url) { const c = cdp(target); try { await c.call('Page.navigate', { url }); } finally { c.close(); } }

const linksExpression = `JSON.stringify([...document.querySelectorAll('a[href],a.title,.learning-activity')].map(a => ({href:a.href||'',text:(a.innerText||a.textContent||'').trim(),id:a.id||'',clickIndex:a.classList.contains('title')?[...document.querySelectorAll('a.title')].indexOf(a):null,cls:a.className||''})).filter(x => x.text))`;
const lessonSnapshotExpression = `JSON.stringify((function(){
  const text=x=>String(x?.innerText||x?.textContent||'').trim();
  const controls=[...document.querySelectorAll('.pagination a,.pagination button,.pagination li,.pager-button,[ng-click*="changePage"],[aria-current]')];
  const pages=controls.map(x=>({text:text(x),className:String(x.className||''),ariaCurrent:x.getAttribute('aria-current')||'',ngClick:x.getAttribute('ng-click')||'',disabled:!!x.disabled||x.getAttribute('aria-disabled')==='true'})).filter(x=>x.text||x.ariaCurrent||x.ngClick);
  const active=pages.filter(x=>/active|current|selected/i.test(x.className)||/^(true|page)$/i.test(x.ariaCurrent)).map(x=>x.text).filter(Boolean);
  const currentPage=pages.find(x=>/^(true|page)$/i.test(x.ariaCurrent))?.text || active.find(x=>/^\\d+$/.test(x)) || null;
  const loading=!!document.querySelector('.loading,.spinner,[aria-busy="true"],.is-loading');
  return {ids:[...document.querySelectorAll('.learning-activity')].map(x=>x.id||x.getAttribute('data-id')||'').filter(Boolean),active,pages,currentPage,loading};
})())`;
async function lessonSnapshot(target) {
  const raw = await evaluate(target, lessonSnapshotExpression).catch(() => '{}');
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}
async function selectLessonPage(target, pageNumber) {
  if (pageNumber <= 1) return;
  const pageExpr = `(function(){
    const exact='[ng-click="changePage(${pageNumber})"]';
    const x=document.querySelector(exact); if(x){x.click(); return true;}
    const candidates=[...document.querySelectorAll('a,button,.pager-button,[role="button"]')];
    const y=candidates.find(a=>String(a.innerText||a.textContent||'').trim()==='${pageNumber}');
    if(y){y.click(); return true;}
    const next=candidates.find(a=>/下一页|next/i.test(String(a.innerText||a.textContent||'')));
    if(next){next.click(); return true;} return false;
  })()`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const before = await lessonSnapshot(target);
    const clicked = await evaluate(target, pageExpr).catch(() => false);
    if (!clicked) throw new Error(`无法点击课程分页第 ${pageNumber} 页`);
    for (let wait = 0; wait < 30; wait++) {
      await sleep(500);
      const after = await lessonSnapshot(target);
      if (pageTransitionConfirmed(before, after, pageNumber)) return after;
    }
  }
  throw new Error(`课程分页第 ${pageNumber} 页加载超时，页面状态未确认`);
}
async function discoverLinks(target, url, kind, pageNumber = 1) {
  const currentHref = await evaluate(target, 'location.href').catch(() => '');
  const stay = useCurrentPage && kind === 'lesson' && /\/course\/\d+\/lesson/i.test(String(currentHref));
  if (!stay) await navigate(target, url);
  for (let wait = 0; wait < 20; wait++) {
    const ready = await evaluate(target, kind === 'lesson' ? "document.querySelectorAll('.learning-activity').length > 0" : "document.querySelectorAll('a[href]').length > 0").catch(() => false);
    if (ready) break;
    await sleep(750);
  }
  if (!stay && kind === 'lesson' && pageNumber > 1) await selectLessonPage(target, pageNumber);
  for (let i = 0; i < 8; i++) {
    const raw = await evaluate(target, linksExpression).catch(() => '[]');
    let links = []; try { links = JSON.parse(raw || '[]'); } catch {}
    const filtered = links.filter((x) => kind === 'course'
      ? /\/course\/\d+\//i.test(x.href)
      : (/\/learning-activity|\/lesson\//i.test(x.href) || /^learning-activity-\d+$/i.test(x.id)));
    if (kind === 'lesson') {
      const page = new URL(url);
      const base = page.origin + page.pathname.replace(/\/lesson\/?$/i, '/learning-activity') + '#/';
      for (const item of filtered) {
        const match = item.id.match(/^learning-activity-(\d+)$/i);
        if (match && !item.href) item.href = `${base}${match[1]}`;
      }
    }
    if (filtered.length) return [...new Map(filtered.map((x) => [x.href, x])).values()];
    await sleep(1000);
  }
  return [];
}

async function loadState() { try { return JSON.parse(await readFile(statePath, 'utf8')); } catch { return { version: 1, lessons: {} }; } }
async function saveState(state) { await mkdir(out, { recursive: true }); await writeFile(statePath, JSON.stringify(state, null, 2), 'utf8'); }
function keyOf(item) { return `${item.courseId}/${item.lessonId}`; }
function samplingKey() { return [interval, threshold, versionVisual, versionText, slideVisual, slideText].map((value) => String(value).replace(/[^a-zA-Z0-9.-]/g, '_')).join('_'); }
function idFrom(url, fallback) {
  const text = String(url);
  return text.match(/#\/(\d+)/)?.[1]
    || text.match(/\/(?:activity|lesson)[/=](\d+)/i)?.[1]
    || text.match(/\/course\/(\d+)/i)?.[1]
    || fallback;
}

async function discoverAllLessonPages(target, course) {
  const all = []; const seen = new Set();
  for (let pageNumber = 1; pageNumber <= 100; pageNumber++) {
    const items = await discoverLinks(target, course.href, 'lesson', pageNumber);
    const fresh = items.filter((x) => { const id = idFrom(x.href, ''); if (!id || seen.has(id)) return false; seen.add(id); return true; });
    if (!fresh.length) break;
    all.push(...fresh);
    const snapshot = await lessonSnapshot(target);
    const pageLabels = (snapshot.pages ?? []).map((x) => String(x.text ?? x)).filter((x) => /^\d+$/.test(x)).map(Number);
    const hasNext = (snapshot.pages ?? []).some((x) => /下一页|next/i.test(String(x.text ?? '')) && !x.disabled);
    const maxPage = pageLabels.length ? Math.max(...pageLabels) : pageNumber;
    if (!hasNext && pageNumber >= maxPage) break;
    if (!items.length || (pageNumber > 1 && !seen.size)) break;
  }
  return all;
}

const state = await loadState();
const target = await currentTarget();
const courseLinks = allCourses
  ? await discoverLinks(target, 'https://lms.xjtu.edu.cn/user/courses#/', 'course')
  : [{ href: `https://lms.xjtu.edu.cn/course/${courseId}/lesson#/`, text: `course-${courseId}` }];
if (!courseLinks.length) throw new Error('未发现课程链接；请确认当前账号已登录且课程列表已加载');

for (const course of courseLinks) {
  const cid = idFrom(course.href, courseId);
  const lessons = allPages ? await discoverAllLessonPages(target, course) : await discoverLinks(target, course.href, 'lesson', page);
  if (!lessons.length) { console.error(`[skip] ${course.text}: 未发现视频活动`); continue; }
  const filteredLessons = lessonOnly ? lessons.filter((x) => idFrom(x.href, '') === String(lessonOnly)) : lessons;
  const selectedLessons = limit > 0 ? filteredLessons.slice(0, limit) : filteredLessons;
  for (let index = 0; index < selectedLessons.length; index++) {
    const lesson = selectedLessons[index]; const lid = idFrom(lesson.href, String(index + 1));
    const key = keyOf({ courseId: cid, lessonId: lid });
    if (!force && state.lessons[key]?.status === 'completed') {
      const previous = state.lessons[key];
      if (!previous.videoDeleted && previous.cachePath && deleteVideo) {
        try {
          await cleanupLessonCache(cache, previous.cachePath);
          previous.videoDeleted = true; previous.cleanupError = undefined; await saveState(state);
        } catch (error) { previous.cleanupError = String(error?.message ?? error); await saveState(state); }
      }
      continue;
    }
    if (!force && state.lessons[key]?.status === 'failed'
      && Number(state.lessons[key].attempts ?? 0) >= maxRetries) {
      console.error(`[skip] ${cid}/${lid}: 已达到 ${maxRetries} 次重试上限，可用 --force 重新尝试`);
      continue;
    }
    const lessonNumber = allPages ? index + 1 : (page - 1) * 20 + index + 1;
    const variant = samplingKey();
    const lessonOut = resolve(out, cid, variant, `${String(lessonNumber).padStart(2, '0')}-${lesson.text.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 80) || lid}`);
    const lessonCache = resolve(cache, cid, variant, lid);
    const previousAttempt = state.lessons[key];
    state.lessons[key] = { ...(previousAttempt ?? {}), courseId: cid, lessonId: lid, title: lesson.text,
      status: 'opening', url: lesson.href, out: lessonOut, cachePath: lessonCache,
      sampling: { interval, threshold, versionVisual, versionText, slideVisual, slideText },
      attempts: Number(previousAttempt?.attempts ?? 0) + 1, lastStartedAt: new Date().toISOString() };
    await saveState(state);
    try {
      if (dryRun) { state.lessons[key].status = 'pending'; console.log(`[dry-run] ${course.text} -> ${lesson.text}`); continue; }
      const capture = captureXjtuMedia({ port, timeoutMs: seconds * 1000, targetPattern: /xjtu\.edu\.cn/i,
        onProgress: (p) => { if (p.phase === 'media') console.error(`[media] ${cid}/${lid} track=${p.track}`); } });
      await sleep(300);
      await navigate(target, lesson.href);
      for (let attempt = 0; attempt < 15; attempt++) {
        await sleep(700);
        const freshTarget = await currentTarget().catch(() => null);
        if (freshTarget) await playEmbeddedVideos(freshTarget).catch(() => {});
      }
      const result = await capture;
      const candidate = result.candidates.find((x) => x.track === track);
      if (!candidate) throw new Error(`未捕获 PPT 轨道 ${track}，实际轨道: ${[...new Set(result.candidates.map((x) => x.track))].join(', ') || 'none'}`);
      const browserTarget = await currentTarget();
      const cookie = await readCdpCookieHeader(browserTarget, { host: new URL(candidate.url).hostname });
      state.lessons[key].status = 'downloading'; await saveState(state);
      const cached = await cacheXjtuMp4(candidate.url, { dir: lessonCache, trackOverride: candidate.track,
        headers: { ...(candidate.headers ?? {}), ...(cookie ? { Cookie: cookie } : {}), Referer: result.target.url } });
      state.lessons[key].videoBytes = cached.bytes; state.lessons[key].cachePath = lessonCache;
      state.lessons[key].status = 'processing'; await saveState(state);
      await run(process.execPath, [resolve(ROOT, 'bin/course-ppt.mjs'), cached.path, '--out', lessonOut,
        '--interval', String(interval), '--threshold', String(threshold),
        '--version-visual', String(versionVisual), '--version-text', String(versionText),
        '--slide-visual', String(slideVisual), '--slide-text', String(slideText), '--ocr']);
      await run(process.execPath, [resolve(ROOT, 'bin/course-audit.mjs'), lessonOut]);
      const successMarker = await markLessonSuccess(lessonCache, { courseId: cid, lessonId: lid, output: lessonOut });
      state.lessons[key].successMarker = successMarker;
      state.lessons[key].status = 'completed'; state.lessons[key].videoDeleted = false; await saveState(state);
      if (deleteVideo) {
        try { await cleanupLessonCache(cache, lessonCache); state.lessons[key].videoDeleted = true; delete state.lessons[key].cleanupError; }
        catch (error) { state.lessons[key].cleanupError = String(error?.message ?? error); }
        await saveState(state);
      }
      console.log(`[done] ${cid}/${lid} ${lesson.text}`);
    } catch (error) {
      state.lessons[key].status = 'failed'; state.lessons[key].error = String(error?.message ?? error);
      state.lessons[key].failedAt = new Date().toISOString(); await saveState(state);
      console.error(`[failed] ${cid}/${lid}: ${state.lessons[key].error}`);
    }
  }
  // Rebuild the course-level PDF after each batch. Only audited lesson
  // outputs are included, so failed/incomplete lessons never enter it.
  if (!dryRun) {
    const courseRoot = resolve(out, cid);
    const merged = resolve(courseRoot, 'course-all.pdf');
    try {
      await run(process.env.PYTHON || 'python', [resolve(ROOT, 'src/course/merge_course.py'), courseRoot, merged]);
      console.log(`[merged] ${cid} -> ${merged}`);
    } catch (error) {
      console.error(`[merge-failed] ${cid}: ${String(error?.message ?? error)}`);
    }
  }
}
console.log(JSON.stringify({ courses: courseLinks.length, state: statePath }, null, 2));
