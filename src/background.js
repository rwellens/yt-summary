import { quickVerdict, triageTitles } from './summarize.js';
import { t, setLocale, defaultUiLang, badgeLabels } from './i18n.js';

// Clicking the toolbar icon opens the side panel.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// Ollama rejects (403) requests carrying an `Origin: chrome-extension://…` header.
// Strip that header, but only for requests made by THIS extension to localhost:
// no web page benefits from the rule, and OLLAMA_ORIGINS does not need to be changed.
async function installOllamaRule() {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1],
    addRules: [
      {
        id: 1,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [{ header: 'origin', operation: 'remove' }],
        },
        condition: {
          requestDomains: ['localhost', '127.0.0.1'],
          initiatorDomains: [chrome.runtime.id],
          resourceTypes: ['xmlhttprequest', 'other'],
        },
      },
    ],
  });
}

chrome.runtime.onInstalled.addListener(installOllamaRule);
chrome.runtime.onStartup.addListener(installOllamaRule);

// ------------------------------------------------------------------ Thumbnail verdicts

const DEFAULTS = { uiLang: defaultUiLang(), base: 'http://localhost:11434', model: '', lang: defaultUiLang(), interests: '' };
let queue = Promise.resolve(); // one Ollama job at a time, across all tabs

const handlers = {
  // Fast triage: discard, from the title alone, whatever is far from the user's briefing.
  async triage({ items }, settings) {
    const off = await triageTitles({ ...settings, items });
    const at = Date.now();
    const verdicts = Object.fromEntries([...off].map(([id, reason]) => [id, { v: 'off', reason, at, from: 'title' }]));
    if (off.size) {
      await chrome.storage.local.set(Object.fromEntries(Object.entries(verdicts).map(([id, v]) => [`verdict:${id}`, v])));
    }
    return { verdicts };
  },

  // Full verdict, based on the transcript.
  async verdict({ meta, segments }, settings) {
    const verdict = { ...(await quickVerdict({ ...settings, meta, segments })), at: Date.now() };
    await chrome.storage.local.set({ [`verdict:${meta.videoId}`]: verdict });
    return { verdict };
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Badge labels for the content script: answered right away, outside the Ollama queue.
  if (msg?.type === 'labels') {
    chrome.storage.sync.get(DEFAULTS).then(({ uiLang }) => {
      setLocale(uiLang);
      sendResponse(badgeLabels());
    });
    return true;
  }

  const handler = handlers[msg?.type];
  if (!handler) return false;
  const job = queue.then(async () => {
    const settings = await chrome.storage.sync.get(DEFAULTS);
    setLocale(settings.uiLang);
    if (!settings.model) throw new Error(t('noModelChosen'));
    return handler(msg, settings);
  });
  queue = job.catch(() => {});
  job.then(sendResponse, (e) => sendResponse({ error: e.message }));
  return true; // async response
});

// Verdicts depend on the briefing: forget them all when it changes.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'sync' || !changes.interests) return;
  const all = await chrome.storage.local.get(null);
  await chrome.storage.local.remove(Object.keys(all).filter((k) => k.startsWith('verdict:')));
});
