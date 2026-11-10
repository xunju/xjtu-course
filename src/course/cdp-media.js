/** Capture authorized XJTU MP4 requests from a user-owned CDP browser tab. */

import { listTargets } from '../storyboard/browser-time.js';
import { groupXjtuMediaUrls, parseXjtuMediaUrl } from './xjtu-media.js';

const SECRET = /^(?:cookie|authorization|proxy-authorization|x-api-key)$/i;

export function safeRequestHeaders(headers = {}) {
  return Object.fromEntries(Object.entries(headers)
    .filter(([name]) => !SECRET.test(name))
    .map(([name, value]) => [name, String(value)]));
}

function targetScore(target, pattern) {
  const url = String(target?.url ?? '');
  if (pattern && !pattern.test(url)) return -Infinity;
  let score = 0;
  if (/rms-v5\.xjtu\.edu\.cn/i.test(url)) score += 4;
  if (/lms\.xjtu\.edu\.cn/i.test(url)) score += 3;
  if (/player|activity|lesson/i.test(url)) score += 2;
  return score;
}

export function pickCdpTarget(targets, pattern = /xjtu\.edu\.cn/i) {
  return (targets ?? [])
    .filter((target) => target.type === 'page' && target.webSocketDebuggerUrl)
    .map((target) => ({ target, score: targetScore(target, pattern) }))
    .filter((x) => x.score > -Infinity)
    .sort((a, b) => b.score - a.score)[0]?.target ?? null;
}

function command(ws, id, method, params = {}) {
  ws.send(JSON.stringify({ id, method, params }));
}

function request(ws, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const handler = (event) => {
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.id !== id) return;
      ws.removeEventListener?.('message', handler);
      if (message.error) reject(new Error(message.error.message ?? method));
      else resolve(message.result ?? {});
    };
    ws.addEventListener?.('message', handler);
    command(ws, id, method, params);
  });
}

/** Read currentSrc values from the RMS player iframe, without persisting them. */
export async function readCurrentXjtuVideoUrls(target, { WebSocketImpl = WebSocket, timeoutMs = 3000 } = {}) {
  if (!target?.webSocketDebuggerUrl) return [];
  let ws;
  try { ws = new WebSocketImpl(target.webSocketDebuggerUrl); } catch { return []; }
  try {
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('CDP timeout')), timeoutMs); ws.onopen = () => { clearTimeout(timer); resolve(); }; ws.onerror = reject; });
    const tree = await request(ws, 1, 'Page.getFrameTree');
    const frames = [];
    const walk = (node) => { if (/rms-v5\.xjtu\.edu\.cn/i.test(node?.frame?.url ?? '')) frames.push(node.frame); for (const child of node?.childFrames ?? []) walk(child); };
    walk(tree.frameTree);
    const urls = [];
    for (const frame of frames) {
      const world = await request(ws, 2 + urls.length, 'Page.createIsolatedWorld', { frameId: frame.id, worldName: 'dsh-capture', grantUniveralAccess: true });
      const value = await request(ws, 3 + urls.length, 'Runtime.evaluate', { contextId: world.executionContextId, returnByValue: true,
        expression: "JSON.stringify([...document.querySelectorAll('video')].map(v => v.currentSrc || v.src).filter(Boolean))" });
      try { urls.push(...JSON.parse(value.result?.value ?? '[]')); } catch { /* ignore malformed page data */ }
    }
    return [...new Set(urls)];
  } catch { return []; }
  finally { try { ws.close(); } catch { /* ignore */ } }
}

/** Read cookies from the selected browser profile without persisting them. */
export async function readCdpCookieHeader(target, { host, WebSocketImpl = WebSocket, timeoutMs = 3000 } = {}) {
  if (!target?.webSocketDebuggerUrl) return '';
  return new Promise((resolve) => {
    let ws;
    let done = false;
    const finish = (value = '') => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { ws?.close(); } catch { /* ignore */ }
      resolve(value);
    };
    const timer = setTimeout(() => finish(), timeoutMs);
    try { ws = new WebSocketImpl(target.webSocketDebuggerUrl); } catch { finish(); return; }
    ws.onopen = () => command(ws, 1, 'Storage.getCookies');
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        if (msg.id !== 1) return;
        const cookies = msg.result?.cookies ?? [];
        const wanted = host ? String(host).toLowerCase() : null;
        finish(cookies.filter((c) => c.name && c.value && (!wanted || !c.domain
          || wanted === c.domain.replace(/^\./, '').toLowerCase()
          || wanted.endsWith(c.domain.toLowerCase())))
          .map((c) => `${c.name}=${c.value}`).join('; '));
      } catch { finish(); }
    };
    ws.onerror = () => finish();
    ws.onclose = () => finish();
  });
}

/**
 * Capture MP4 requests while the user plays the already logged-in tab.
 * Raw signed URLs are returned for immediate in-memory download only.
 */
export async function captureXjtuMedia({
  port = 9333,
  targetPattern = /xjtu\.edu\.cn/i,
  timeoutMs = 30_000,
  targetsFn = listTargets,
  WebSocketImpl = WebSocket,
  onProgress,
} = {}) {
  const targets = await targetsFn({ port });
  const target = pickCdpTarget(targets, targetPattern);
  if (!target) throw new Error('no matching logged-in XJTU browser tab found; enable a CDP port and open the player');

  return new Promise((resolve, reject) => {
    const found = new Map();
    let nextId = 1;
    let settled = false;
    let ws;
    let currentPoll;
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(currentPoll);
      try { ws?.close(); } catch { /* ignore */ }
      if (error) reject(error);
      else {
        const candidates = [...found.values()];
        // The current RMS player exposes two authorized /preview URLs rather
        // than the older 0-/2- filenames. Their request order is camera then
        // PPT, matching the track convention confirmed for this LMS.
        const preview = candidates.filter((x) => x.track.startsWith('preview-'));
        if (preview.length >= 2) {
          preview.forEach((x, i) => { x.originalTrack = x.track; x.track = i === 0 ? '0' : '2'; });
        }
        resolve({ target: { url: target.url, title: target.title }, candidates,
          groups: groupXjtuMediaUrls(candidates.map((x) => x.url)) });
      }
    };
    const timer = setTimeout(() => finish(), timeoutMs);
    try { ws = new WebSocketImpl(target.webSocketDebuggerUrl); } catch (error) { finish(error); return; }
    ws.onopen = () => {
      command(ws, nextId++, 'Network.enable');
      command(ws, nextId++, 'Page.enable');
      onProgress?.({ phase: 'listening', target: target.url });
      // Some RMS responses are already buffered before Network.enable. Read
      // currentSrc in the player iframe as a fallback; URLs remain in memory.
      readCurrentXjtuVideoUrls(target, { WebSocketImpl }).then((urls) => {
        for (const url of urls) {
          const media = parseXjtuMediaUrl(url);
          if (media && !found.has(url)) found.set(url, { ...media, headers: {} });
        }
      }).catch(() => {});
      currentPoll = setInterval(() => {
        readCurrentXjtuVideoUrls(target, { WebSocketImpl }).then((urls) => {
          for (const url of urls) {
            const media = parseXjtuMediaUrl(url);
            if (media && !found.has(url)) found.set(url, { ...media, headers: {} });
          }
        }).catch(() => {});
      }, 1000);
    };
    ws.onmessage = (event) => {
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.method !== 'Network.requestWillBeSent') return;
      const request = message.params?.request;
      const media = parseXjtuMediaUrl(request?.url);
      if (!media) return;
      if (!found.has(request.url)) {
        found.set(request.url, { ...media, headers: safeRequestHeaders(request.headers) });
        onProgress?.({ phase: 'media', url: media.redactedUrl, track: media.track });
      }
    };
    ws.onerror = (error) => finish(new Error(`CDP media capture failed: ${error?.message ?? 'socket error'}`));
    ws.onclose = () => finish();
  });
}
