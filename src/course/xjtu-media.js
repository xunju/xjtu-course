/**
 * 识别西交大 LMS / rms-v5 播放器产生的 MP4 候选。
 *
 * 播放器会为同一时间段请求多条 MP4（目前观察到 0- 和 2- 前缀）。
 * 前缀只表示轨道候选，不能在没有画面证据时假定哪一条是 PPT。
 */

const XJTU_HOST = /(^|\.)rms-v5\.xjtu\.edu\.cn$/i;
const NAME = /^(?<track>[^-]+)-(?<lesson>[^-]+)-(?<from>\d{8,})-(?<to>\d{8,})\.mp4$/i;
const PREVIEW = /\/captures\/(?<capture>[^/]+)\/videos\/(?<video>\d+)\/preview$/i;

export function isXjtuMediaUrl(raw) {
  try {
    const u = new URL(String(raw));
    return u.protocol === 'https:' && XJTU_HOST.test(u.hostname)
      && (/\.mp4(?:$|\?)/i.test(u.pathname) || PREVIEW.test(u.pathname));
  } catch {
    return false;
  }
}

/** Parse only the non-secret pathname. Query parameters are retained only in url. */
export function parseXjtuMediaUrl(raw) {
  if (!isXjtuMediaUrl(raw)) return null;
  const u = new URL(String(raw));
  const file = decodeURIComponent(u.pathname.split('/').pop() ?? '');
  const m = NAME.exec(file);
  if (!m?.groups) {
    const preview = PREVIEW.exec(u.pathname);
    if (!preview?.groups) return null;
    return {
      url: String(raw), track: `preview-${preview.groups.video}`, lesson: preview.groups.capture,
      from: '', to: '', key: `${preview.groups.capture}/${preview.groups.video}`,
      redactedUrl: `${u.origin}${u.pathname}`,
    };
  }
  const { track, lesson, from, to } = m.groups;
  return {
    url: String(raw),
    track,
    lesson,
    from,
    to,
    key: `${lesson}/${from}-${to}`,
    // Safe for logs and manifests: excludes signed query parameters.
    redactedUrl: `${u.origin}${u.pathname}`,
  };
}

/** Group requests for one lesson window without deciding which track is PPT. */
export function groupXjtuMediaUrls(urls) {
  const groups = new Map();
  for (const raw of urls ?? []) {
    const item = parseXjtuMediaUrl(raw);
    if (!item) continue;
    const group = groups.get(item.key) ?? { key: item.key, lesson: item.lesson,
      from: item.from, to: item.to, tracks: [] };
    if (!group.tracks.some((x) => x.track === item.track && x.url === item.url)) {
      group.tracks.push(item);
    }
    groups.set(item.key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    tracks: group.tracks.sort((a, b) => a.track.localeCompare(b.track)),
  }));
}

/** Return a candidate only after an explicit track choice (never guess by prefix). */
export function chooseXjtuTrack(group, track) {
  if (!group || track === undefined || track === null) return null;
  return group.tracks?.find((candidate) => candidate.track === String(track)) ?? null;
}
