import { extractTranscript, seekTo } from './transcript.js';
import { listModels } from './ollama.js';
import { summarize, parseVerdict, fmtTime, VERDICT_EMOJI } from './summarize.js';
import { fetchSummary, pushSummary, withoutVerdictSection } from './veille.js';
import { renderMarkdown } from './markdown.js';
import { t, setLocale, applyI18n, defaultUiLang, UI_LANGUAGES, OUTPUT_LANGUAGES, outputLanguage } from './i18n.js';

const $ = (id) => document.getElementById(id);

const DEFAULTS = {
  uiLang: defaultUiLang(),
  base: 'http://localhost:11434',
  model: '',
  badgeBase: '', // empty: same server as the summary
  badgeModel: '',
  lang: defaultUiLang(),
  length: 'short',
  interests: '',
  badges: true,
  veilleBase: '', // optional "veille" app: reuse and keep summaries
};
let settings = { ...DEFAULTS };

let current = null; // { tabId, videoId, title }
// One job per video: switching tabs during a generation does not lose it.
const jobs = new Map(); // videoId → { phase, status, text, error, controller, meta }

const options = (entries) => entries.map(([k, v]) => `<option value="${k}">${v}</option>`).join('');

// ---------------------------------------------------------------- Settings

async function loadSettings() {
  settings = { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };
  setLocale(settings.uiLang);
  applyI18n();

  $('uiLang').innerHTML = options(Object.entries(UI_LANGUAGES));
  $('uiLang').value = settings.uiLang;
  $('lang').innerHTML = options(Object.entries(OUTPUT_LANGUAGES).map(([k, v]) => [k, v.label]));
  $('lang').value = settings.lang;
  $('base').value = settings.base;
  $('badgeBase').value = settings.badgeBase;
  $('interests').value = settings.interests;
  $('veilleBase').value = settings.veilleBase;
  $('badges').checked = settings.badges;
  document.querySelector(`input[name="length"][value="${settings.length}"]`).checked = true;
  await loadModels();
}

async function saveSettings(patch) {
  Object.assign(settings, patch);
  await chrome.storage.sync.set(settings);
}

async function loadModels() {
  await Promise.all([loadSummaryModels(), loadBadgeModels()]);
}

async function loadSummaryModels() {
  const sel = $('model');
  const msg = $('settingsMsg');
  try {
    const models = await listModels(settings.base);
    if (!models.length) throw new Error(t('noModels'));
    sel.innerHTML = models.map((m) => `<option>${m}</option>`).join('');
    if (!models.includes(settings.model)) await saveSettings({ model: models[0] });
    sel.value = settings.model;
    msg.textContent = t('modelsAvailable', { n: models.length });
    msg.classList.remove('bad');
  } catch (e) {
    sel.innerHTML = settings.model ? `<option>${settings.model}</option>` : '';
    msg.textContent = e.message;
    msg.classList.add('bad');
  }
}

// Thumbnails may run on another Ollama (e.g. a local one, while summaries go
// through a remote server). Without a server of their own, they can reuse the
// summary model ("same as summary").
async function loadBadgeModels() {
  const sel = $('badgeModel');
  const msg = $('badgeMsg');
  const own = !!settings.badgeBase;
  try {
    const models = await listModels(settings.badgeBase || settings.base);
    if (!models.length) throw new Error(t('noModels'));
    sel.innerHTML = options([...(own ? [] : [['', t('sameAsSummary')]]), ...models.map((m) => [m, m])]);
    if (settings.badgeModel ? !models.includes(settings.badgeModel) : own) {
      await saveSettings({ badgeModel: own ? models[0] : '' });
    }
    sel.value = settings.badgeModel;
    msg.textContent = t('badgeModelHint');
    msg.classList.remove('bad');
  } catch (e) {
    sel.innerHTML = settings.badgeModel ? `<option>${settings.badgeModel}</option>` : '';
    msg.textContent = e.message;
    msg.classList.add('bad');
  }
}

$('settingsBtn').addEventListener('click', () => {
  const panel = $('settings');
  panel.hidden = !panel.hidden;
  $('settingsBtn').setAttribute('aria-expanded', String(!panel.hidden));
});
$('uiLang').addEventListener('change', async (e) => {
  await saveSettings({ uiLang: e.target.value });
  setLocale(settings.uiLang);
  applyI18n();
  loadModels(); // refreshes the translated status line
  render();
});
$('model').addEventListener('change', (e) => saveSettings({ model: e.target.value }));
$('badgeModel').addEventListener('change', (e) => saveSettings({ badgeModel: e.target.value }));
$('lang').addEventListener('change', (e) => saveSettings({ lang: e.target.value }));
$('refreshModels').addEventListener('click', loadModels);
$('badges').addEventListener('change', (e) => saveSettings({ badges: e.target.checked }));
$('interests').addEventListener('change', (e) => saveSettings({ interests: e.target.value.trim() }));
$('veilleBase').addEventListener('change', (e) => {
  const v = e.target.value.trim().replace(/\/+$/, '');
  e.target.value = v;
  saveSettings({ veilleBase: v });
});
document.querySelectorAll('input[name="length"]').forEach((r) =>
  r.addEventListener('change', (e) => saveSettings({ length: e.target.value })),
);
// Cache: thumbnail verdicts (verdict:<id>) and summaries (sum:<id>).
async function clearCache(prefix, msgKey) {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith(prefix));
  await chrome.storage.local.remove(keys);
  // Tells the content scripts to forget in-memory states too (errors, videos without captions).
  if (prefix === 'verdict:') await chrome.storage.local.set({ cacheReset: Date.now() });
  const msg = $('settingsMsg');
  msg.classList.remove('bad');
  msg.textContent = t(msgKey, { n: keys.length });
}
$('clearVerdicts').addEventListener('click', () => clearCache('verdict:', 'clearedVerdicts'));
$('clearSummaries').addEventListener('click', () => clearCache('sum:', 'clearedSummaries'));
$('base').addEventListener('change', async (e) => {
  const v = e.target.value.trim().replace(/\/+$/, '') || DEFAULTS.base;
  e.target.value = v;
  await saveSettings({ base: v });
  loadModels(); // the thumbnail list may depend on this server too
});
$('badgeBase').addEventListener('change', async (e) => {
  const v = e.target.value.trim().replace(/\/+$/, '');
  e.target.value = v;
  await saveSettings({ badgeBase: v, badgeModel: '' });
  loadBadgeModels();
});

// ---------------------------------------------------------------- Active tab

function videoIdFrom(url) {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith('youtube.com') && u.pathname === '/watch') return u.searchParams.get('v');
  } catch {}
  return null;
}

async function refreshTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const videoId = tab && videoIdFrom(tab.url);
  current = videoId
    ? { tabId: tab.id, videoId, title: (tab.title || '').replace(/^\(\d+\)\s*/, '').replace(/ - YouTube$/, '') }
    : null;

  if (current && !jobs.has(videoId)) {
    const cached = (await chrome.storage.local.get(`sum:${videoId}`))[`sum:${videoId}`];
    if (cached && !jobs.has(videoId)) jobs.set(videoId, { phase: 'done', text: cached.md, meta: cached, cached: true });
    else if (!cached) {
      render();
      await loadFromVeille(videoId);
    }
  }
  render();
}

chrome.tabs.onActivated.addListener(refreshTab);
chrome.tabs.onUpdated.addListener((_id, info, tab) => {
  if (tab.active && (info.url || info.title)) refreshTab();
});
chrome.windows.onFocusChanged.addListener(refreshTab);

// ---------------------------------------------------------------- Veille app

// A summary the watch app already has is shown at once (Claude's detailed one first).
async function loadFromVeille(videoId) {
  const v = await fetchSummary(settings.veilleBase, videoId);
  const body = v && (v.resume_claude_md || v.resume_md);
  if (!body || jobs.has(videoId)) return;
  const lang = outputLanguage(settings.lang);
  const verdict = v.verdict
    ? `## ${lang.headings.verdict}\n${VERDICT_EMOJI[v.verdict]} ${lang.verdicts[v.verdict]}${v.raison ? ` : ${v.raison}` : ''}\n\n`
    : '';
  const meta = { title: v.titre, author: v.chaine, model: t('fromVeille'), fromVeille: true, at: Date.now() };
  jobs.set(videoId, { phase: 'done', text: verdict + body, meta, cached: true });
}

// ---------------------------------------------------------------- Generation

async function run() {
  if (!current) return;
  const { tabId, videoId } = current;
  jobs.get(videoId)?.controller?.abort();

  const job = { phase: 'loading', status: t('fetchingTranscript'), text: '', controller: new AbortController() };
  jobs.set(videoId, job);
  const update = (patch) => {
    Object.assign(job, patch);
    if (current?.videoId === videoId) render();
  };
  render();

  try {
    if (!settings.model) throw new Error(t('pickModel'));

    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: extractTranscript,
    });
    if (!result) throw new Error(t('cannotReadPage'));
    if (result.error) throw new Error(t(result.error));

    job.meta = { ...result.meta, model: settings.model, lang: settings.lang, length: settings.length };
    update({ status: t('transcriptReady', { n: result.segments.length, model: settings.model }) });

    const md = await summarize({
      base: settings.base,
      model: settings.model,
      lang: settings.lang,
      length: settings.length,
      interests: settings.interests,
      meta: result.meta,
      segments: result.segments,
      signal: job.controller.signal,
      onStatus: (status) => update({ status }),
      onToken: (_chunk, full) => update({ phase: 'streaming', text: full }),
    });

    update({ phase: 'done', text: md, controller: null, meta: { ...job.meta, at: Date.now() } });
    // The full summary's verdict (more reliable) replaces the thumbnail one.
    const verdict = parseVerdict(md);
    await chrome.storage.local.set({
      [`sum:${videoId}`]: { ...job.meta, md },
      ...(verdict ? { [`verdict:${videoId}`]: { ...verdict, at: Date.now() } } : {}),
    });
    pushSummary(settings.veilleBase, {
      id: videoId,
      titre: job.meta.title || current?.title || '',
      chaine: job.meta.author || '',
      verdict: verdict?.v || '',
      raison: verdict?.reason || '',
      resume_md: withoutVerdictSection(md),
      modele: settings.model,
    });
  } catch (e) {
    if (e.name === 'AbortError') update({ phase: job.text ? 'done' : 'idle', controller: null });
    else update({ phase: 'error', error: e.message, controller: null });
  }
}

$('summarizeBtn').addEventListener('click', run);
$('stopBtn').addEventListener('click', () => current && jobs.get(current.videoId)?.controller?.abort());

$('copyBtn').addEventListener('click', async () => {
  const job = current && jobs.get(current.videoId);
  if (!job?.text) return;
  const title = job.meta?.title || current.title;
  await navigator.clipboard.writeText(`# ${title}\nhttps://www.youtube.com/watch?v=${current.videoId}\n\n${job.text}`);
  $('copyBtn').textContent = t('copied');
  setTimeout(() => ($('copyBtn').textContent = t('copy')), 1500);
});

// Clickable timestamps → jump in the video.
$('output').addEventListener('click', (e) => {
  const a = e.target.closest('a.ts');
  if (!a || !current) return;
  e.preventDefault();
  chrome.scripting.executeScript({ target: { tabId: current.tabId }, world: 'MAIN', func: seekTo, args: [Number(a.dataset.t)] });
});

// ---------------------------------------------------------------- Rendering

let lastRendered = '';

function render() {
  $('empty').hidden = !!current;
  $('video').hidden = !current;
  if (!current) return;

  const job = jobs.get(current.videoId) || { phase: 'idle' };
  const busy = job.phase === 'loading' || job.phase === 'streaming';

  const thumb = `https://i.ytimg.com/vi/${current.videoId}/mqdefault.jpg`;
  if ($('thumb').src !== thumb) $('thumb').src = thumb;
  $('title').textContent = job.meta?.title || current.title;
  $('author').textContent = job.meta?.author
    ? `${job.meta.author}${job.meta.lengthSeconds ? ' · ' + fmtTime(job.meta.lengthSeconds) : ''}`
    : '';

  const btn = $('summarizeBtn');
  btn.hidden = busy;
  btn.classList.toggle('secondary', job.phase === 'done');
  $('summarizeLabel').textContent = t(job.phase === 'done' ? 'regenerate' : job.phase === 'error' ? 'retry' : 'summarize');

  $('status').hidden = !busy;
  $('statusText').textContent = job.status || '';
  $('skeleton').hidden = job.phase !== 'loading';

  $('error').hidden = job.phase !== 'error';
  $('error').textContent = job.error || '';

  const out = $('output');
  const showText = !!job.text && job.phase !== 'error';
  out.hidden = !showText;
  out.classList.toggle('streaming', job.phase === 'streaming');
  if (showText) {
    const key = `${current.videoId}:${job.text}`;
    if (key !== lastRendered) {
      out.innerHTML = renderMarkdown(job.text);
      lastRendered = key;
    }
  } else {
    lastRendered = '';
  }

  $('actions').hidden = job.phase !== 'done';
  if (job.phase === 'done' && job.meta) {
    const when = job.meta.at ? new Date(job.meta.at).toLocaleDateString(settings.uiLang) : '';
    $('meta').textContent = [job.meta.model, when].filter(Boolean).join(' · ');
  }
}

// ---------------------------------------------------------------- Startup

await loadSettings();
await refreshTab();
