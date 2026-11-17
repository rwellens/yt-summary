import { t } from './i18n.js';

// Minimal client for the Ollama HTTP API.

async function post(base, path, body, signal) {
  let res;
  try {
    res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new Error(t('ollamaUnreachable', { base }));
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    if (res.status === 403) throw new Error(t('ollama403'));
    throw new Error(`Ollama ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res;
}

export async function listModels(base) {
  let res;
  try {
    res = await fetch(`${base}/api/tags`);
  } catch {
    throw new Error(t('ollamaUnreachable', { base }));
  }
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const { models = [] } = await res.json();
  return models.map((m) => m.name).sort();
}

export async function capabilities(base, model) {
  const res = await post(base, '/api/show', { model });
  return (await res.json()).capabilities || [];
}

// Streaming chat: calls onToken for each fragment, returns the full text.
export async function chat(base, body, { signal, onToken } = {}) {
  const res = await post(base, '/api/chat', { ...body, stream: true }, signal);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.error) throw new Error(`Ollama: ${msg.error}`);
      const chunk = msg.message?.content || '';
      if (chunk) {
        full += chunk;
        onToken?.(chunk, full);
      }
    }
  }
  return full;
}
