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
  $('context').textContent = `${data.kind}：${data.title || data.url}；课程 ${data.courses?.length || 0}，课次 ${data.lessons?.length || 0}，第 ${data.page?.current || 1} 页`;
  const courseList = $('courseList'); courseList.replaceChildren();
  if (data.courses?.length) { $('courses').hidden = false; for (const course of data.courses) courseList.append(button(`${course.title}（${course.id}）`, () => message('OPEN_URL', { url: course.url || `https://lms.xjtu.edu.cn/course/${course.id}/lesson#/` }).catch((e) => show(e.message)))); } else $('courses').hidden = true;
  const lessonList = $('lessonList'); lessonList.replaceChildren();
  if (data.lessons?.length) { $('lessons').hidden = false; for (const lesson of data.lessons) lessonList.append(button(`${lesson.title || '未命名课次'}（${lesson.id}）`, () => message('OPEN_URL', { url: lesson.url }).catch((e) => show(e.message)))); } else $('lessons').hidden = true;
  $('start').disabled = data.kind !== 'activity'; $('startAll').disabled = !['lessons', 'activity'].includes(data.kind); show(data);
}
function applyPreset(name) { const p = presets[name]; if (p) [$('interval').value, $('threshold').value, $('visual').value, $('text').value, $('slideVisual').value, $('slideText').value] = p; }
async function scan() { try { render(await message('SCAN_ACTIVE')); } catch (e) { $('context').textContent = e.message; show(e.message); } }
async function start(allPages) { try { if (!current) await scan(); if (!current) return; const job = await message('START_JOB', { mode: allPages ? 'course' : 'activity', allPages, deleteVideo: $('delete').checked, sampling: sampling() }); currentJobId = job.jobId; $('cancel').hidden = false; show(job); poll(job.jobId); } catch (e) { show(e.message); } }
async function poll(jobId) { clearTimeout(pollTimer); try { const job = await message('GET_JOB', { jobId }); show(job); if (['queued', 'running'].includes(job.status)) pollTimer = setTimeout(() => poll(jobId), 1000); else $('cancel').hidden = true; } catch (e) { show(e.message); } }
$('preset').addEventListener('change', () => applyPreset($('preset').value)); $('scan').addEventListener('click', scan);
$('health').addEventListener('click', async () => { try { show(await message('HEALTH')); } catch (e) { show(`本地服务不可用：${e.message}`); } });
$('start').addEventListener('click', () => start(false)); $('startAll').addEventListener('click', () => start(true));
$('cancel').addEventListener('click', async () => { try { show(await message('CANCEL_JOB', { jobId: currentJobId })); } catch (e) { show(e.message); } });
scan();
