import test from 'node:test';
import assert from 'node:assert/strict';
import { pickCdpTarget, safeRequestHeaders, captureXjtuMedia } from '../src/course/cdp-media.js';

test('CDP target selection prefers XJTU player pages and redacts secret headers', () => {
  const target = pickCdpTarget([
    { type: 'page', url: 'https://example.com', webSocketDebuggerUrl: 'ws://a' },
    { type: 'page', url: 'https://rms-v5.xjtu.edu.cn/player', webSocketDebuggerUrl: 'ws://b' },
  ]);
  assert.equal(target.url, 'https://rms-v5.xjtu.edu.cn/player');
  assert.deepEqual(safeRequestHeaders({ Cookie: 'x', Authorization: 'y', Referer: 'z' }), { Referer: 'z' });
});

test('captures MP4 requests and groups tracks without persisting secrets', async () => {
  const events = [];
  class FakeWS {
    constructor() { this.sent = []; setTimeout(() => this.onopen?.(), 0); }
    send(message) {
      this.sent.push(JSON.parse(message));
      if (this.sent.at(-1).method === 'Network.enable') setTimeout(() => {
        this.onmessage?.({ data: JSON.stringify({ method: 'Network.requestWillBeSent', params: { request: {
          url: 'https://rms-v5.xjtu.edu.cn/media/2-21301-202609141430-202609141530.mp4?token=secret',
          headers: { Cookie: 'secret', Referer: 'https://lms.xjtu.edu.cn/' },
        } } }) });
      }, 1);
    }
    close() { this.onclose?.(); }
  }
  const result = await captureXjtuMedia({
    targetsFn: async () => [{ type: 'page', url: 'https://rms-v5.xjtu.edu.cn/player', webSocketDebuggerUrl: 'ws://fake' }],
    WebSocketImpl: FakeWS, timeoutMs: 20,
    onProgress: (p) => events.push(p),
  });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].headers.Cookie, undefined);
  assert.equal(result.groups[0].tracks[0].track, '2');
  assert.ok(events.some((x) => x.phase === 'media'));
});

test('maps the current two RMS preview URLs to camera/PPT tracks', async () => {
  class FakeWS {
    constructor() { this.sent = []; setTimeout(() => this.onopen?.(), 0); }
    send(message) {
      this.sent.push(JSON.parse(message));
      if (this.sent.at(-1).method === 'Network.enable') setTimeout(() => {
        for (const id of ['915107', '915110']) this.onmessage?.({ data: JSON.stringify({ method: 'Network.requestWillBeSent', params: { request: {
          url: `https://rms-v5.xjtu.edu.cn/api/base/orgs/xjtu/captures/cap/videos/${id}/preview?previewToken=secret`, headers: {},
        } } }) });
      }, 1);
    }
    close() { this.onclose?.(); }
  }
  const result = await captureXjtuMedia({
    targetsFn: async () => [{ type: 'page', url: 'https://rms-v5.xjtu.edu.cn/player', webSocketDebuggerUrl: 'ws://fake' }],
    WebSocketImpl: FakeWS, timeoutMs: 20,
  });
  assert.deepEqual(result.candidates.map(x => x.track), ['0', '2']);
  assert.equal(result.candidates[1].originalTrack, 'preview-915110');
});
