import test from 'node:test';
import assert from 'node:assert/strict';
import { lessonIds, orderedLessonIdsChanged, pageMarker, pageTransitionConfirmed } from '../src/course/xjtu-pagination.js';

test('pagination accepts a changed lesson list only after loading ends', () => {
  const before = { ids: ['learning-activity-1', 'learning-activity-2'], currentPage: '1' };
  const loading = { ids: ['learning-activity-3', 'learning-activity-4'], currentPage: '2', loading: true };
  const after = { ids: ['learning-activity-3', 'learning-activity-4'], currentPage: '2', loading: false };
  assert.equal(pageTransitionConfirmed(before, loading, 2), false);
  assert.equal(pageTransitionConfirmed(before, after, 2), true);
});

test('pagination rejects stale first-page content and wrong page marker', () => {
  const before = { ids: ['a', 'b'], currentPage: '1' };
  assert.equal(pageTransitionConfirmed(before, { ids: ['a', 'b'], currentPage: '2' }, 2), false);
  assert.equal(pageTransitionConfirmed(before, { ids: ['c', 'd'], currentPage: '3' }, 2), false);
  assert.equal(orderedLessonIdsChanged(before, { ids: ['c', 'd'] }), true);
  assert.equal(pageMarker({ currentPage: '2' }, 2), true);
  assert.deepEqual(lessonIds({ ids: ['a', 'a', '', 'b'] }), ['a', 'b']);
});

test('older templates without a page marker can use changed lesson IDs', () => {
  assert.equal(pageTransitionConfirmed({ ids: ['a'] }, { ids: ['b'] }, 2), true);
});
