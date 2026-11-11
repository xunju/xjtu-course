const $ = (id) => document.getElementById(id);
const presets = {
  balanced: [0.3, 0.03, 0.999, 0.98, 0.999, 0.99],
  fast: [1, 0.03, 0.999, 0.98, 0.999, 0.99],
  complete: [0.1, 0.02, 0.999, 0.98, 0.999, 0.99],
};
let current = null;
let pollTimer = null;
let currentJobId = null;
function sampling() {
  return { interval: Number($('interval').value), threshold: Number($('threshold').value), versionVisual: Number($('visual').value), versionText: Number($('text').value), slideVisual: Number($('slideVisual').value), slideText: Number($('slideText').value) };
}
function show(value) { $('result').textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2); }
async function message(type, extra = {}) { const result = await chrome.runtime.sendMessage({ type, ...extra }); if (!result?.ok) throw new Error(result?.error || '插件请求失败'); return result.data; }
function button(label, onClick) { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', onClick); return b; }
function render(data) {
  current = data;
  $('context').textContent = `${data.kind}：${data.courseTitle || data.title || data.url}；课程 ${data.courses?.length || 0}，课次 ${data.lessons?.length || 0}，第 ${data.page?.current || 1} 页`;
  const courseList = $('courseList'); courseList.replaceChildren();
  if (data.courses?.length) { $('courses').hidden = false; for (const course of data.courses) courseList.append(button(`${course.title}（${course.id}）`, () => message('OPEN_URL', { url: course.url || `https://lms.xjtu.edu.cn/course/${course.id}/lesson#/` }).catch((e) => show(e.message)))); } else $('courses').hidden = true;
  const lessonList = $('lessonList'); lessonList.replaceChildren();
  if (data.lessons?.length) { $('lessons').hidden = false; for (const lesson of data.lessons) lessonList.append(button(`${lesson.title || '未命名课次'}（${lesson.id}）`, () => message('OPEN_URL', { url: lesson.url }).catch((e) => show(e.message)))); } else $('lessons').hidden = true;
  $('start').disabled = data.kind !== 'activity'; $('startAll').disabled = !['lessons', 'activity'].includes(data.kind); show(data);
}
function applyPreset(name) { const p = presets[name]; if (p) [$('interval').value, $('threshold').value, $('visual').value, $('text').value, $('slideVisual').value, $('slideText').value] = p; }
function renderJob(job) {
  const p = job.progress || {};
  $('jobProgress').hidden = false;
  const labels = { queued: '排队中', running: '运行中', completed: '已完成', failed: '失败', cancelled: '已取消' };
  $('jobPhase').textContent = `${labels[job.status] || job.status} · ${p.phase || 'starting'}`;
  const percent = Number.isFinite(p.percent) ? p.percent : (job.status === 'completed' ? 100 : 0);
  const phase = String(p.phase || '');
  const postProcess = /^(processing|auditing)/i.test(phase);
  const indeterminate = /^(starting|discovering|opening|capture-|processing|auditing)/i.test(phase);
  $('progressBar').classList.toggle('indeterminate', indeterminate && job.status === 'running');
  $('progressBar').style.width = indeterminate && job.status === 'running' ? '35%' : `${Math.max(0, Math.min(100, percent))}%`;
  const bytes = Number.isFinite(p.bytes) ? `${(p.bytes / 1048576).toFixed(1)} MB` : '';
  const stage = /^processing-extract-frames/i.test(phase) ? '正在抽取视频帧' : /^processing-ocr/i.test(phase) ? '正在进行 OCR' : /^processing-export-pdf/i.test(phase) ? '正在导出 PDF' : postProcess ? '视频已下载，正在处理' : '';
  const total = Number.isFinite(p.total) ? ` / 共 ${p.total} 节` : '';
  const sizeText = Number.isFinite(p.totalBytes) ? ` / ${(p.totalBytes / 1048576).toFixed(1)} MB` : '';
  $('progressText').textContent = `${stage}${stage && (bytes || sizeText) ? '；' : ''}${percent ? `${percent}% ` : ''}${bytes}${sizeText}${total} · 已完成 ${p.completed || 0} · 失败 ${p.failed || 0}`;
  $('jobOutput').textContent = p.output ? `输出：${p.output}` : job.current?.error ? `错误：${job.current.error}` : job.error ? `错误：${job.error}` : '';
  const entries = Object.values(job.items || {});
  $('jobItems').hidden = !entries.length;
  const list = $('jobItemList'); list.replaceChildren();
  for (const item of entries.sort((a, b) => String(a.lessonId).localeCompare(String(b.lessonId)))) {
    const row = document.createElement('div'); row.className = 'job-item';
    const title = item.title || `课次 ${item.lessonId}`;
    const pct = Number.isFinite(item.percent) ? item.percent : (item.phase === 'completed' ? 100 : 0);
    row.innerHTML = `<strong>${title}</strong><br>${item.phase || item.status || '等待'} · ${pct}%<div class="mini-track"><div class="mini-bar" style="width:${Math.max(0, Math.min(100, pct))}%"></div></div>`;
    list.append(row);
  }
}
async function restoreJobs() { try { const jobs = await message('LIST_JOBS'); const active = jobs.find(j => ['queued', 'running'].includes(j.status)); if (active) { currentJobId = active.id; $('cancel').hidden = false; renderJob(active); poll(active.id); } } catch {} }
async function scan() { try { render(await message('SCAN_ACTIVE')); } catch (e) { $('context').textContent = e.message; show(e.message); } }
async function start(allPages) { try { if (!current) await scan(); if (!current) return; const job = await message('START_JOB', { mode: allPages ? 'course' : 'activity', allPages, deleteVideo: $('delete').checked, ocr: $('ocr').checked, sampling: sampling() }); currentJobId = job.jobId; $('cancel').hidden = false; renderJob(job); poll(job.jobId); } catch (e) { show(e.message); } }
async function poll(jobId) { clearTimeout(pollTimer); try { const job = await message('GET_JOB', { jobId }); renderJob(job); if (['queued', 'running'].includes(job.status)) pollTimer = setTimeout(() => poll(jobId), 1000); else $('cancel').hidden = true; } catch (e) { show(e.message); } }
$('preset').addEventListener('change', () => applyPreset($('preset').value)); $('scan').addEventListener('click', scan);
$('health').addEventListener('click', async () => { try { show(await message('HEALTH')); } catch (e) { show(`本地服务不可用：${e.message}`); } });
$('start').addEventListener('click', () => start(false)); $('startAll').addEventListener('click', () => start(true));
$('cancel').addEventListener('click', async () => { try { show(await message('CANCEL_JOB', { jobId: currentJobId })); } catch (e) { show(e.message); } });
scan();
restoreJobs();

