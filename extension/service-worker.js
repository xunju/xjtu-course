const API = 'http://127.0.0.1:8765';

async function local(path, init = {}) {
  const response = await fetch(`${API}${path}`, { ...init, headers: { 'content-type': 'application/json', ...(init.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `本地服务 HTTP ${response.status}`);
  return body;
}

async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]?.id) throw new Error('没有找到当前标签页');
  return tabs[0];
}

async function scanTab(tab) {
  try { return (await chrome.tabs.sendMessage(tab.id, { type: 'SCAN_PAGE' })).data; }
  catch { throw new Error('当前页面不是支持的 LMS 页面，或页面尚未加载完成'); }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === 'SCAN_ACTIVE') {
      const tab = await activeTab();
      return { ok: true, data: await scanTab(tab) };
    }
    if (message?.type === 'HEALTH') return { ok: true, data: await local('/health') };
    if (message?.type === 'OPEN_URL') {
      const tab = await activeTab();
      const url = String(message.url || '');
      if (!/^https:\/\/lms\.xjtu\.edu\.cn\//i.test(url)) throw new Error('只允许打开 XJTU LMS 页面');
      await chrome.tabs.update(tab.id, { url });
      return { ok: true, data: { url } };
    }
    if (message?.type === 'START_JOB') {
      const tab = await activeTab();
      const page = await scanTab(tab);
      const sampling = message.sampling || {};
      const job = await local('/v1/jobs', { method: 'POST', body: JSON.stringify({
        source: 'browser-extension', mode: message.mode || page.kind, page, sampling,
        allPages: Boolean(message.allPages), deleteVideo: Boolean(message.deleteVideo),
      }) });
      return { ok: true, data: job };
    }
    if (message?.type === 'GET_JOB') return { ok: true, data: await local(`/v1/jobs/${encodeURIComponent(message.jobId)}`) };
    if (message?.type === 'CANCEL_JOB') {
      if (!message.jobId) throw new Error('没有可取消的任务');
      return { ok: true, data: await local(`/v1/jobs/${encodeURIComponent(message.jobId)}/cancel`, { method: 'POST' }) };
    }
    throw new Error('未知插件消息');
  })().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message })).catch(() => {});
  return true;
});
