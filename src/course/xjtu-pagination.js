/** Pure pagination checks shared by the LMS batch runner and tests. */

export function lessonIds(snapshot = {}) {
  return [...new Set((snapshot.ids ?? []).map(String).filter(Boolean))];
}

export function orderedLessonIdsChanged(before = {}, after = {}) {
  const a = lessonIds(before);
  const b = lessonIds(after);
  if (!a.length || !b.length) return false;
  if (a[0] !== b[0] || a.length !== b.length) return true;
  return a.some((id, index) => id !== b[index]);
}

export function pageMarker(snapshot = {}, pageNumber) {
  const target = String(pageNumber);
  const values = [snapshot.currentPage, ...(snapshot.active ?? []), ...(snapshot.selected ?? [])]
    .map((value) => String(value ?? '').trim()).filter(Boolean);
  return values.includes(target);
}

/**
 * A page is accepted only after its lesson list changed and the page is no
 * longer loading. If the LMS exposes a page marker, it must agree as well.
 * Older LMS templates expose no marker, so a changed ordered lesson list is
 * sufficient in that case.
 */
export function pageTransitionConfirmed(before, after, pageNumber) {
  if (after?.loading) return false;
  if (!orderedLessonIdsChanged(before, after)) return false;
  const hasMarker = [after?.currentPage, ...(after?.active ?? []), ...(after?.selected ?? [])]
    .some((value) => String(value ?? '').trim());
  return !hasMarker || pageMarker(after, pageNumber);
}

