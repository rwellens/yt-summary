// YouTube content script: puts a "worth watching or not" badge on visible thumbnails.
// Transcripts are fetched here (same origin as YouTube); the LLM runs in the service
// worker (one analysis at a time, so the machine is not overloaded).
(() => {
  const ATTR = 'data-yts-id';
  const ICON = { watch: '✅', skim: '⏩', skip: '📄', off: '🚫' };
  let labels = {}; // translated badge labels, provided by the service worker (see i18n.js)
  const TRIAGE_BATCH = 24;

  let enabled = false;
  const verdicts = new Map(); // videoId → { v, reason } | { v: 'none' } | 'pending' | 'error'
  const titles = new Map(); // videoId → { title, channel } read from the thumbnail
  const triaged = new Set(); // videoIds already sent to the title triage
  const askedVeille = new Set(); // videoIds already looked up in the watch app
  let hasBriefing = false;
  const visible = new Set(); // <a> anchors currently on screen
  let busy = false;

  // ------------------------------------------------------------ Transcript

  let clientVersion = null;
  function getClientVersion() {
    if (clientVersion) return clientVersion;
    for (const s of document.scripts) {
      const m = s.textContent.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/);
      if (m) return (clientVersion = m[1]);
    }
    return '2.20261116.00.00';
  }

  async function fetchTranscript(videoId) {
    const inner = [0x0a, 0x0b, ...[...videoId].map((c) => c.charCodeAt(0)), 0x18, 0x01];
    const params = btoa(String.fromCharCode(0xaa, 0x09, inner.length, ...inner));
    const res = await fetch('/youtubei/v1/get_panel?prettyPrint=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB', clientVersion: getClientVersion(), hl: document.documentElement.lang || 'fr' } },
        panelId: 'PAmodern_transcript_view',
        params,
      }),
    });
    if (!res.ok) throw new Error(`get_panel ${res.status}`);
    const toSec = (ts) => (ts || '').split(':').reduce((a, p) => a * 60 + (Number(p) || 0), 0);
    const segments = [];
    JSON.parse(await res.text(), (k, v) => {
      if (k === 'transcriptSegmentViewModel' && v?.simpleText) {
        segments.push({ start: toSec(v.timestamp), text: v.simpleText.replace(/\s+/g, ' ').trim() });
      }
      return v;
    });
    return segments;
  }

  // ------------------------------------------------------------ Thumbnails

  const videoIdOf = (a) => {
    try {
      const u = new URL(a.href);
      return u.pathname === '/watch' ? u.searchParams.get('v') : null;
    } catch {
      return null;
    }
  };

  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const infoOf = (a) => {
    const item = a.closest('yt-lockup-view-model, ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer');
    const t = item?.querySelector('h3, #video-title, a[title]');
    const c = item?.querySelector('a[href^="/@"], a[href^="/channel/"], ytd-channel-name');
    return { title: clean(t?.getAttribute('title') || t?.textContent), channel: clean(c?.textContent) };
  };

  const isThumb = (a) =>
    !a.closest('#movie_player, ytd-reel-item-renderer, ytm-shorts-lockup-view-model') &&
    !!a.querySelector('img, yt-thumbnail-view-model, yt-image');

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) e.isIntersecting ? visible.add(e.target) : visible.delete(e.target);
      pump();
    },
    { rootMargin: '100px' },
  );

  const observed = new WeakSet();

  async function scan() {
    if (!enabled) return;
    const anchors = [...document.querySelectorAll('a[href*="/watch?v="]')].filter(isThumb);
    const unknown = new Set();
    for (const a of anchors) {
      const id = videoIdOf(a);
      if (!id) continue;
      if (!observed.has(a)) {
        observed.add(a);
        io.observe(a);
      }
      const info = infoOf(a);
      if (info.title) titles.set(id, info);
      if (!verdicts.has(id)) unknown.add(id);
      // YouTube recycles elements: the badge follows the current href.
      if (a.getAttribute(ATTR) !== id) paint(a, id);
    }
    if (unknown.size) {
      const keys = [...unknown].map((id) => `verdict:${id}`);
      const stored = await chrome.storage.local.get(keys);
      for (const id of unknown) if (stored[`verdict:${id}`]) verdicts.set(id, stored[`verdict:${id}`]);
      repaintAll();
    }
    pump();
  }

  function paint(a, id) {
    a.setAttribute(ATTR, id);
    let badge = a.querySelector(':scope > .yts-badge');
    const state = verdicts.get(id);

    if (!state || state === 'error' || state.v === 'none') {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'yts-badge';
      a.appendChild(badge);
    }
    if (state === 'pending') {
      badge.dataset.v = 'pending';
      badge.textContent = labels.analysing || '…';
      badge.title = labels.analysingTitle || '';
      return;
    }
    badge.dataset.v = state.v;
    badge.textContent = `${ICON[state.v]} ${labels[state.v] || ''}`.trim();
    badge.title = state.reason || '';
  }

  function repaintAll(onlyId) {
    for (const a of document.querySelectorAll(`a[${ATTR}]`)) {
      const id = a.getAttribute(ATTR);
      if (!onlyId || id === onlyId) paint(a, id);
    }
  }

  // ------------------------------------------------------------ Status pill

  // Small floating indicator, bottom-left, visible only while something is being analysed.
  let pill = null;
  const fill = (tpl, vars) => (tpl || '').replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

  function showStatus(text, waiting = 0) {
    if (!pill) {
      pill = document.createElement('div');
      pill.className = 'yts-status';
      pill.setAttribute('role', 'status');
      pill.innerHTML = '<span class="yts-spinner" aria-hidden="true"></span><span class="yts-status-text"></span><span class="yts-status-queue"></span>';
      document.body.appendChild(pill);
    }
    pill.querySelector('.yts-status-text').textContent = text;
    pill.querySelector('.yts-status-queue').textContent = waiting > 0 ? fill(labels.statusQueue, { n: waiting }) : '';
    pill.title = text;
    pill.classList.add('on');
  }

  function hideStatus() {
    pill?.classList.remove('on');
  }

  // ------------------------------------------------------------ Analysis queue

  // Visible videos without a verdict, top to bottom (reading order).
  function pendingVisibleIds() {
    const pos = (a) => a.getBoundingClientRect();
    const ids = [...visible]
      .filter((a) => a.isConnected)
      .sort((x, y) => pos(x).top - pos(y).top || pos(x).left - pos(y).left)
      .map(videoIdOf)
      .filter((id) => id && !verdicts.has(id));
    return [...new Set(ids)];
  }

  // Step 1: fast triage on titles, a single call for the whole screen.
  async function triage(ids) {
    const batch = ids.filter((id) => !triaged.has(id)).slice(0, TRIAGE_BATCH);
    batch.forEach((id) => triaged.add(id)); // even without a readable title: avoids an endless loop
    const items = batch.filter((id) => titles.get(id)?.title).map((id) => ({ id, ...titles.get(id) }));
    if (!items.length) return false;
    showStatus(fill(labels.statusTriage, { n: items.length }));
    try {
      const res = await chrome.runtime.sendMessage({ type: 'triage', items });
      if (res?.error) throw Object.assign(new Error(res.error), { fatal: res.fatal });
      for (const [id, v] of Object.entries(res.verdicts || {})) {
        verdicts.set(id, v);
        repaintAll(id);
      }
    } catch (e) {
      console.debug('[YT Summary] triage', e.message);
      if (e.fatal || /Ollama|Extension context/.test(e.message)) enabled = false;
    }
    return true;
  }

  async function pump() {
    if (!enabled || busy || document.hidden) return hideStatus();
    const ids = pendingVisibleIds();
    if (!ids.length) return hideStatus();
    busy = true;

    // Step 0: verdicts the watch app already has (no Ollama call at all).
    const unasked = ids.filter((id) => !askedVeille.has(id));
    if (unasked.length) {
      unasked.forEach((id) => askedVeille.add(id));
      try {
        const known = await chrome.runtime.sendMessage({ type: 'known', ids: unasked });
        for (const [id, v] of Object.entries(known || {})) {
          verdicts.set(id, v);
          repaintAll(id);
        }
      } catch {
        /* extension reloaded */
      }
      busy = false;
      return pump();
    }

    if (hasBriefing && ids.some((id) => !triaged.has(id))) {
      await triage(ids);
      busy = false;
      return pump();
    }

    // Step 2: full verdict on the transcript, one video at a time.
    const id = ids[0];
    verdicts.set(id, 'pending');
    repaintAll(id);
    showStatus(fill(labels.statusVerdict, { title: titles.get(id)?.title || id }), ids.length - 1);

    try {
      const segments = await fetchTranscript(id);
      if (!segments.length) {
        const none = { v: 'none', at: Date.now() };
        verdicts.set(id, none);
        chrome.storage.local.set({ [`verdict:${id}`]: none });
      } else {
        const res = await chrome.runtime.sendMessage({
          type: 'verdict',
          meta: { videoId: id, title: titles.get(id)?.title || '', author: titles.get(id)?.channel || '' },
          segments,
        });
        if (res?.error) throw Object.assign(new Error(res.error), { fatal: res.fatal });
        verdicts.set(id, res.verdict); // the service worker also stores it
      }
    } catch (e) {
      console.debug('[YT Summary]', id, e.message);
      verdicts.set(id, 'error'); // no retry until the next page load
      if (e.fatal || /Ollama|Extension context/.test(e.message)) enabled = false; // no point in insisting
    }

    repaintAll(id);
    busy = false;
    pump();
  }

  // ------------------------------------------------------------ Startup

  let scanTimer = null;
  const mo = new MutationObserver(() => {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 400);
  });

  function start() {
    enabled = true;
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
    scan();
  }

  function stop() {
    enabled = false;
    hideStatus();
    mo.disconnect();
    document.querySelectorAll('.yts-badge').forEach((b) => b.remove());
    document.querySelectorAll(`a[${ATTR}]`).forEach((a) => a.removeAttribute(ATTR));
  }

  document.addEventListener('visibilitychange', pump);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.badges) changes.badges.newValue ? start() : stop();
    if (area === 'sync' && changes.uiLang) loadLabels().then(() => repaintAll());
    if (area === 'sync' && changes.interests) hasBriefing = !!changes.interests.newValue?.trim();
    if (area === 'local' && changes.cacheReset) {
      // Cache cleared from the side panel: forget everything, including errors, and start over.
      verdicts.clear();
      triaged.clear();
      askedVeille.clear();
      repaintAll();
      chrome.storage.sync.get({ badges: true }).then((s) => s.badges && start());
      return;
    }
    if (area === 'local') {
      let cleared = false;
      for (const [key, { newValue }] of Object.entries(changes)) {
        if (!key.startsWith('verdict:')) continue;
        const id = key.slice(8);
        if (newValue) {
          verdicts.set(id, newValue);
        } else {
          // Briefing changed: verdicts were cleared, analyse again.
          if (verdicts.get(id) !== 'pending') verdicts.delete(id);
          triaged.delete(id);
          cleared = true;
        }
        repaintAll(id);
      }
      if (cleared) pump();
    }
  });

  async function loadLabels() {
    try {
      labels = (await chrome.runtime.sendMessage({ type: 'labels' })) || {};
    } catch {
      /* extension reloaded: this content script is orphaned */
    }
  }

  Promise.all([chrome.storage.sync.get({ badges: true, interests: '' }), loadLabels()]).then(([s]) => {
    hasBriefing = !!s.interests.trim();
    if (s.badges) start();
  });
})();
