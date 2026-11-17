// Optional link with a "veille" app (the user's watch app, e.g. on a home server):
// reuse the summaries and verdicts it already has, and send it new summaries.
// Every call is best effort: the extension works the same without it.

async function call(base, path, init = {}) {
  const res = await fetch(`${base.replace(/\/+$/, '')}${path}`, { ...init, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  return res.json();
}

// Summary already known by the app: { id, titre, chaine, verdict, raison, resume_md, resume_claude_md, url } | null.
export async function fetchSummary(base, videoId) {
  if (!base) return null;
  try {
    return await call(base, `/api/videos/${encodeURIComponent(videoId)}`);
  } catch {
    return null;
  }
}

// Sends a summary made here, so that the app keeps it.
export async function pushSummary(base, payload) {
  if (!base) return;
  try {
    await call(base, '/api/videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    /* the app is optional */
  }
}

// Verdicts already known by the app: { videoId: { v, reason } }.
export async function fetchVerdicts(base, ids) {
  if (!base || !ids.length) return {};
  try {
    return (await call(base, `/api/verdicts?ids=${ids.map(encodeURIComponent).join(',')}`)) || {};
  } catch {
    return {};
  }
}

// Removes the leading "## Verdict" section: the app shows its own verdict badge.
export function withoutVerdictSection(md) {
  const m = md.match(/^\s*#{1,4}[^\n]*\n[^\n]*[✅⏩📄🚫][^\n]*\n+/u);
  return m ? md.slice(m[0].length) : md;
}
