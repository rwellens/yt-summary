// Runs in the MAIN world of the YouTube tab through chrome.scripting.executeScript.
// It is serialized (toString), so it must stay self-contained: no reference to any
// outer code.
//
// Strategy:
//   1. Internal `get_panel` API (fast, does not touch the page). The `timedtext` captions
//      API returns an empty body without an anti-bot token since 2025, so it is not tried.
//   2. Otherwise, open the "Transcript" panel and read it from the DOM.
export async function extractTranscript() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const videoId = new URL(location.href).searchParams.get('v');
  if (location.pathname !== '/watch' || !videoId) return { error: 'NO_VIDEO' };

  // --- Metadata --------------------------------------------------------------
  let pr = document.getElementById('movie_player')?.getPlayerResponse?.();
  if (pr?.videoDetails?.videoId !== videoId) {
    pr = window.ytInitialPlayerResponse?.videoDetails?.videoId === videoId ? window.ytInitialPlayerResponse : null;
  }
  const vd = pr?.videoDetails || {};
  const meta = {
    videoId,
    title: vd.title || document.title.replace(/^\(\d+\)\s*/, '').replace(/ - YouTube$/, ''),
    author: vd.author || '',
    lengthSeconds: Number(vd.lengthSeconds) || 0,
  };

  // --- 1: internal get_panel API (the one behind the "Transcript" panel) -----
  try {
    // `params` is a base64 protobuf that only wraps the video id.
    const inner = [0x0a, 0x0b, ...[...videoId].map((c) => c.charCodeAt(0)), 0x18, 0x01];
    const params = btoa(String.fromCharCode(0xaa, 0x09, inner.length, ...inner));
    const res = await fetch('/youtubei/v1/get_panel?prettyPrint=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: window.ytcfg?.get?.('INNERTUBE_CONTEXT') || {
          client: { clientName: 'WEB', clientVersion: window.ytcfg?.get?.('INNERTUBE_CLIENT_VERSION'), hl: 'fr' },
        },
        panelId: 'PAmodern_transcript_view',
        params,
      }),
    });
    if (res.ok) {
      const toSec = (ts) => (ts || '').split(':').reduce((a, p) => a * 60 + (Number(p) || 0), 0);
      const segments = [];
      JSON.parse(await res.text(), (k, v) => {
        if (k === 'transcriptSegmentViewModel' && v?.simpleText) {
          segments.push({ start: toSec(v.timestamp), text: v.simpleText.replace(/\s+/g, ' ').trim() });
        }
        return v;
      });
      if (segments.length) return { meta, segments, source: 'get_panel' };
    }
  } catch {
    /* fall back to the panel */
  }

  // --- 2: "Transcript" panel -------------------------------------------------
  const toSeconds = (ts) =>
    (ts || '')
      .trim()
      .split(':')
      .reduce((acc, p) => acc * 60 + (Number(p) || 0), 0);

  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const PANEL = 'ytd-engagement-panel-section-list-renderer';
  const EXPANDED = 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED';

  // New panel (2026): <transcript-segment-view-model>; legacy: <ytd-transcript-segment-renderer>.
  const segmentEls = () => [
    ...document.querySelectorAll('transcript-segment-view-model, ytd-transcript-segment-renderer'),
  ];
  const readPanel = () =>
    segmentEls()
      .map((el) => {
        const ts = el.querySelector('.ytwTranscriptSegmentViewModelTimestamp, .segment-timestamp');
        const txt = el.querySelector('.ytAttributedStringHost, .segment-text');
        return { start: toSeconds(ts?.textContent), text: clean(txt?.textContent) };
      })
      .filter((s) => s.text);

  const expandedPanelOf = (el) => {
    const p = el?.closest(PANEL);
    return p?.getAttribute('visibility') === EXPANDED ? p : null;
  };

  // Panel already opened by the user? Read it as is and leave it open.
  const alreadyOpen = expandedPanelOf(segmentEls()[0]);
  let segments = alreadyOpen ? readPanel() : [];

  if (!segments.length) {
    const btn = document.querySelector('ytd-video-description-transcript-section-renderer button');
    if (!btn) return { meta, error: 'NO_TRANSCRIPT' };

    // Segments from a previous video may linger (SPA navigation): wait until they change.
    const before = segmentEls()[0];
    const beforeSig = readPanel().slice(0, 3).map((s) => s.text).join('|');
    btn.click();

    for (let i = 0; i < 60; i++) {
      await sleep(250);
      const first = segmentEls()[0];
      if (!first || !expandedPanelOf(first)) continue;
      const cur = readPanel();
      const sig = cur.slice(0, 3).map((s) => s.text).join('|');
      if (cur.length && (first !== before || sig !== beforeSig || !beforeSig)) {
        segments = cur;
        break;
      }
    }

    expandedPanelOf(segmentEls()[0])?.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
  }

  if (!segments.length) return { meta, error: 'NO_TRANSCRIPT' };
  return { meta, segments, source: 'panel' };
}

// Jumps to a given time in the video (MAIN world).
export function seekTo(seconds) {
  const p = document.getElementById('movie_player');
  if (!p?.seekTo) return;
  p.seekTo(seconds, true);
  p.playVideo?.();
}
