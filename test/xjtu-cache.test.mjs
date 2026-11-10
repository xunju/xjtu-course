import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { cacheXjtuMp4, readXjtuCacheMeta } from '../src/course/xjtu-cache.js';

const url = 'https://rms-v5.xjtu.edu.cn/media/0-21301-202609141430-202609141530.mp4?token=secret';

test('downloads XJTU MP4 and persists only redacted metadata', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xjtu-cache-'));
  try {
    const result = await cacheXjtuMp4(url, {
      dir,
      headers: { Cookie: 'must-not-persist' },
      fetchImpl: async (_url, init) => {
        assert.equal(init.headers.Cookie, 'must-not-persist');
        return new Response(new Blob(['ppt-bytes']), { status: 200, headers: { 'content-type': 'video/mp4' } });
      },
    });
    assert.equal(await readFile(result.path, 'utf8'), 'ppt-bytes');
    const meta = await readXjtuCacheMeta(join(dir, result.path.split(/[/\\]/).at(-2)));
    assert.equal(meta.source.includes('token='), false);
    assert.equal(JSON.stringify(meta).includes('must-not-persist'), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('resumes a partial file with Range and appends 206 body', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xjtu-cache-resume-'));
  try {
    // The cache key is opaque; seed the only directory after deriving it from first call.
    const first = await cacheXjtuMp4(url, { dir, fetchImpl: async () => new Response(new Blob(['abc'])) });
    await rm(first.path);
    await writeFile(`${first.path}.part`, 'abc');
    const result = await cacheXjtuMp4(url, {
      dir,
      fetchImpl: async (_url, init) => {
        assert.equal(init.headers.Range, 'bytes=3-');
        return new Response(new Blob(['def']), { status: 206 });
      },
    });
    assert.equal(await readFile(result.path, 'utf8'), 'abcdef');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
