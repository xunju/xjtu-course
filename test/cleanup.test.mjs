import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, stat, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cleanupLessonCache, markLessonSuccess } from '../src/course/cleanup.js';

test('writes a success marker and removes only a child lesson cache', async () => {
  const root = await mkdtemp(join(tmpdir(), 'course-cleanup-'));
  const lesson = join(root, 'course', 'lesson');
  try {
    await mkdir(lesson, { recursive: true });
    await writeFile(join(lesson, 'video.mp4'), 'temporary');
    const marker = await markLessonSuccess(lesson, { courseId: 'c1', lessonId: 'l1' });
    assert.match(await readFile(marker, 'utf8'), /"courseId": "c1"/);
    await cleanupLessonCache(root, lesson);
    await assert.rejects(stat(lesson));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('refuses to remove the cache root itself', async () => {
  const root = await mkdtemp(join(tmpdir(), 'course-cleanup-root-'));
  try { await assert.rejects(cleanupLessonCache(root, root), /lesson root/); }
  finally { await rm(root, { recursive: true, force: true }); }
});
