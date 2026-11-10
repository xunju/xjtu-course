import { mkdir, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

function inside(root, target) {
  const r = relative(resolve(root), resolve(target));
  return r === '' || (r && !r.startsWith('..') && !isAbsolute(r));
}

/** Write a durable success marker before removing a temporary lesson cache. */
export async function markLessonSuccess(cacheDir, details = {}) {
  await mkdir(cacheDir, { recursive: true });
  const marker = resolve(cacheDir, 'SUCCESS.json');
  await writeFile(marker, JSON.stringify({ version: 1, ...details, markedAt: new Date().toISOString() }, null, 2), 'utf8');
  return marker;
}

/** Remove one lesson cache only after the caller has passed course-audit. */
export async function cleanupLessonCache(cacheRoot, cacheDir) {
  if (!inside(cacheRoot, cacheDir) || resolve(cacheRoot) === resolve(cacheDir)) {
    throw new Error(`refusing to remove cache outside lesson root: ${cacheDir}`);
  }
  await rm(cacheDir, { recursive: true, force: true });
  return true;
}
