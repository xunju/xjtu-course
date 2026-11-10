(() => {
  const text = (node) => String(node?.innerText || node?.textContent || '').replace(/\s+/g, ' ').trim();
  const absolute = (href) => { try { return new URL(href || '', location.href).href; } catch { return ''; } };
  const courseId = (href) => absolute(href).match(/\/course\/(\d+)/i)?.[1] || null;
  const lessonId = (href, node = null) => {
    const value = absolute(href);
    return value.match(/#\/(\d+)/)?.[1]
      || value.match(/\/(?:activity|lesson)[/=](\d+)/i)?.[1]
      || String(node?.getAttribute?.('data-id') || '').match(/(\d{5,})/)?.[1]
      || String(node?.id || '').match(/(?:learning-activity-|activity-)(\d{5,})/i)?.[1]
      || null;
  };
  const isLessonLink = (href, id = '') => /learning-activity|\/lesson\//i.test(href) || /^learning-activity-\d+$/i.test(id);
  const unique = (items, key) => [...new Map(items.filter((x) => x[key]).map((x) => [x[key], x])).values()];
  function pageInfo() {
    const controls = [...document.querySelectorAll('.pagination li, .pagination a, .pagination button, .pager-button, [aria-label*="页"], [aria-label*="page"]')];
    const pages = [...new Set(controls.flatMap((node) => (text(node).match(/^\d+$/g) || []).map(Number)))].sort((a, b) => a - b);
    const active = controls.find((node) => /active|current|selected/i.test(node.className || '') || node.getAttribute('aria-current') === 'page');
    const current = Number(text(active).match(/\d+/)?.[0] || 1);
    const next = controls.find((node) => /下一页|next/i.test(text(node)));
    return { current, pages, hasNext: Boolean(next && !next.disabled && next.getAttribute('aria-disabled') !== 'true'), loading: Boolean(document.querySelector('.loading,.is-loading,[aria-busy="true"]')) };
  }
  function scan() {
    const url = location.href;
    const courses = unique([...document.querySelectorAll('a[href*="/course/"], [data-course-id]')].map((a) => ({
      id: courseId(a.href || a.getAttribute('data-href') || '') || a.getAttribute('data-course-id'),
      title: text(a) || text(a.closest('[class*="course"],li,article')),
      url: absolute(a.href || a.getAttribute('data-href') || ''),
    })).filter((x) => x.id && x.title && !/learning-activity|\/lesson/i.test(x.url)), 'id');
    const lessons = unique([...document.querySelectorAll('a[href], .learning-activity, [data-id^="learning-activity"], [data-activity-id]')].map((node) => {
      const href = node.href || node.getAttribute('data-href') || '';
      return { id: lessonId(href, node), title: text(node), url: absolute(href), domId: node.id || '', page: pageInfo().current };
    }).filter((x) => x.id && (isLessonLink(x.url, x.domId) || /^\d{5,}$/.test(x.id))), 'id');
    return {
      url, kind: /\/user\/courses/i.test(url) ? 'courses' : /\/learning-activity/i.test(url) ? 'activity' : /\/lesson/i.test(url) ? 'lessons' : 'other',
      courseId: courseId(url), lessonId: lessonId(url), courses, lessons, page: pageInfo(),
      title: text(document.querySelector('h1,h2,.course-title,.lesson-title')) || document.title,
      capturedAt: new Date().toISOString(),
    };
  }
  async function selectPage(pageNumber) {
    const wanted = String(pageNumber);
    const before = scan();
    const exact = document.querySelector(`[ng-click="changePage(${CSS.escape(wanted)})"]`);
    const candidates = [...document.querySelectorAll('.pagination a,.pagination button,.pagination li,[role="button"],.pager-button')];
    const node = exact || candidates.find((x) => text(x) === wanted);
    if (!node) throw new Error(`找不到第 ${wanted} 页分页按钮`);
    node.click();
    for (let i = 0; i < 40; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const current = scan();
      const changed = current.lessons.length && (current.lessons[0]?.id !== before.lessons[0]?.id || current.lessons.length !== before.lessons.length || current.lessons.some((x, i) => x.id !== before.lessons[i]?.id));
      if (!current.page.loading && changed && (current.page.current === Number(wanted) || !current.page.pages.length)) {
        const stable = JSON.stringify(current.lessons.map((x) => x.id));
        await new Promise((resolve) => setTimeout(resolve, 300));
        const confirm = scan();
        if (stable === JSON.stringify(confirm.lessons.map((x) => x.id))) return confirm;
      }
    }
    throw new Error(`第 ${wanted} 页加载超时`);
  }
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'SCAN_PAGE') { sendResponse({ ok: true, data: scan() }); return true; }
    if (message?.type === 'SELECT_LESSON_PAGE') { selectPage(Number(message.page)).then((data) => sendResponse({ ok: true, data })).catch((error) => sendResponse({ ok: false, error: error.message })); return true; }
    if (message?.type === 'PAGE_CONTEXT') { sendResponse({ ok: true, url: location.href }); return true; }
    return false;
  });
})();
