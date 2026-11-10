import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseXjtuTrack, groupXjtuMediaUrls, isXjtuMediaUrl, parseXjtuMediaUrl,
} from '../src/course/xjtu-media.js';

const a = 'https://rms-v5.xjtu.edu.cn/media/0-21301-202609141430-202609141530.mp4?token=secret';
const b = 'https://rms-v5.xjtu.edu.cn/media/2-21301-202609141430-202609141530.mp4?token=secret2';
const preview = 'https://rms-v5.xjtu.edu.cn/api/base/orgs/xjtu/captures/cap123/videos/915110/preview?previewToken=secret';

test('recognizes and redacts XJTU MP4 candidates', () => {
  assert.equal(isXjtuMediaUrl(a), true);
  const parsed = parseXjtuMediaUrl(a);
  assert.deepEqual({ track: parsed.track, lesson: parsed.lesson, from: parsed.from, to: parsed.to }, {
    track: '0', lesson: '21301', from: '202609141430', to: '202609141530',
  });
  assert.equal(parsed.redactedUrl.includes('token='), false);
  assert.equal(isXjtuMediaUrl('https://example.com/0-x.mp4'), false);
});

test('groups multiple tracks without guessing which is PPT', () => {
  const [group] = groupXjtuMediaUrls([a, b, a]);
  assert.equal(group.key, '21301/202609141430-202609141530');
  assert.deepEqual(group.tracks.map((x) => x.track), ['0', '2']);
  assert.equal(chooseXjtuTrack(group, '2').track, '2');
  assert.equal(chooseXjtuTrack(group, '9'), null);
  assert.equal(chooseXjtuTrack(group), null);
});

test('recognizes current RMS preview URLs without retaining preview tokens', () => {
  assert.equal(isXjtuMediaUrl(preview), true);
  const parsed = parseXjtuMediaUrl(preview);
  assert.equal(parsed.track, 'preview-915110');
  assert.equal(parsed.lesson, 'cap123');
  assert.equal(parsed.redactedUrl.endsWith('/videos/915110/preview'), true);
  assert.equal(parsed.redactedUrl.includes('previewToken'), false);
});
