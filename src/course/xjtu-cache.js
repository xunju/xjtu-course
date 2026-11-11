/**
 * Authorized MP4 cache for the XJTU LMS player.
 *
 * The caller supplies an already-authorized URL and, when required, request
 * headers from its own browser session. This module never logs or persists
 * those headers or the signed query string.
 */

import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';

import { parseXjtuMediaUrl } from './xjtu-media.js';

function cacheKey(media) {
  return createHash('sha256').update(`${media.redactedUrl}|${media.track}`).digest('hex').slice(0, 24);
}

function safeMeta(media, trackOverride) {
  return {
    source: media.redactedUrl,
    track: trackOverride ?? media.track,
    lesson: media.lesson,
    from: media.from,
    to: media.to,
  };
}

/**
 * Download an authorized XJTU MP4 with resumable .part storage.
 *
 * @param {string} url signed MP4 URL captured from the authorized player
 * @param {object} options
 * @param {string} options.dir cache root
 * @param {Record<string,string>} [options.headers] browser-derived headers
 * @param {typeof fetch} [options.fetchImpl] injectable fetch for tests
 * @param {(p:object)=>void} [options.onProgress]
 */
export async function cacheXjtuMp4(url, {
  dir,
  headers = {},
  trackOverride,
  fetchImpl = fetch,
  onProgress,
} = {}) {
  const media = parseXjtuMediaUrl(url);
  if (!media) throw new Error('expected an XJTU rms-v5 MP4 URL');
  if (!dir) throw new Error('cache directory is required');

  const folder = join(dir, cacheKey(media));
  const target = join(folder, 'video.mp4');
  const part = `${target}.part`;
  const metaPath = join(folder, 'meta.json');
  await mkdir(folder, { recursive: true });

  const complete = await stat(target).catch(() => null);
  if (complete?.size > 0) {
    onProgress?.({ phase: 'cache-hit', path: target, bytes: complete.size, meta: safeMeta(media, trackOverride) });
    return { path: target, bytes: complete.size, cached: true, meta: safeMeta(media, trackOverride) };
  }

  let offset = (await stat(part).catch(() => null))?.size ?? 0;
  const requestHeaders = { ...headers };
  if (offset > 0) requestHeaders.Range = `bytes=${offset}-`;
  onProgress?.({ phase: 'download', bytes: offset, meta: safeMeta(media, trackOverride) });
  let response = await fetchImpl(url, { headers: requestHeaders });
  if (!response.ok && response.status !== 206) {
    throw new Error(`XJTU MP4 request failed: HTTP ${response.status}`);
  }

  // A server that ignores Range returns 200; discard the partial file before writing.
  if (offset > 0 && response.status !== 206) {
    await rm(part, { force: true });
    offset = 0;
  }

  if (!response.body) throw new Error('XJTU MP4 response has no body');
  const mode = offset > 0 ? 'a' : 'w';
  const declared = Number(response.headers.get('content-length') ?? 0);
  const totalBytes = declared > 0 ? offset + declared : null;
  let received = offset;
  let lastReport = Date.now();
  await pipeline(Readable.fromWeb(response.body), new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      const now = Date.now();
      if (now - lastReport >= 500 || received === totalBytes) {
        lastReport = now;
        onProgress?.({ phase: 'download', bytes: received, totalBytes, meta: safeMeta(media, trackOverride) });
      }
      callback(null, chunk);
    },
  }), createWriteStream(part, { flags: mode }));
  const done = await stat(part);
  await rename(part, target);
  // Only safe metadata is persisted; signed URL and headers never enter the cache.
  await writeFile(metaPath, JSON.stringify({ ...safeMeta(media, trackOverride), bytes: done.size }, null, 2), 'utf8');
  onProgress?.({ phase: 'downloaded', path: target, bytes: done.size, totalBytes, meta: safeMeta(media, trackOverride) });
  return { path: target, bytes: done.size, cached: false, meta: safeMeta(media, trackOverride) };
}

export async function readXjtuCacheMeta(path) {
  try { return JSON.parse(await readFile(join(path, 'meta.json'), 'utf8')); } catch { return null; }
}

