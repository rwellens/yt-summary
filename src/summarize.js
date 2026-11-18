import { chat, capabilities } from './ollama.js';
import { outputLanguage, t } from './i18n.js';

// Beyond this size the transcript is split (map → reduce). ~15k tokens.
const CHUNK_CHARS = 55_000;

export function fmtTime(sec) {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// Groups segments into ~20 s blocks: fewer tokens, still useful timestamps.
export function formatTranscript(segments, blockSec = 20) {
  const lines = [];
  let cur = null;
  for (const s of segments) {
    if (!cur || s.start - cur.start >= blockSec) {
      cur = { start: s.start, parts: [] };
      lines.push(cur);
    }
    cur.parts.push(s.text);
  }
  return lines.map((l) => `[${fmtTime(l.start)}] ${l.parts.join(' ')}`).join('\n');
}

function splitChunks(text, max = CHUNK_CHARS) {
  const chunks = [];
  let cur = '';
  for (const line of text.split('\n')) {
    if (cur && cur.length + line.length + 1 > max) {
      chunks.push(cur);
      cur = '';
    }
    cur += (cur ? '\n' : '') + line;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

// Just enough context: Ollama allocates memory according to num_ctx.
function numCtx(chars) {
  const needed = Math.ceil(chars / 3.2) + 3000;
  return Math.min(32768, Math.max(8192, 2 ** Math.ceil(Math.log2(needed))));
}

// Whether the model supports (and thus needs disabling of) "thinking", cached per model.
const thinkCache = new Map();
async function thinkOff(base, model) {
  if (!thinkCache.has(model)) thinkCache.set(model, (await capabilities(base, model)).includes('thinking'));
  return thinkCache.get(model) ? { think: false } : {};
}

const languageOf = (lang) => outputLanguage(lang).name;

function header(meta) {
  const parts = [`Video: "${meta.title}"`];
  if (meta.author) parts.push(`channel: ${meta.author}`);
  if (meta.lengthSeconds) parts.push(`length: ${fmtTime(meta.lengthSeconds)}`);
  return parts.join(' — ');
}

// ------------------------------------------------------------------ Verdicts

export const VERDICT_EMOJI = { watch: '✅', skim: '⏩', skip: '📄', off: '🚫' };

function verdictCriteria(lang, hasProfile) {
  const label = outputLanguage(lang).verdicts;
  return [
    `- ✅ ${label.watch}: the video gives much more than a summary would (visual demonstration, nuance, dense and useful content${hasProfile ? ", right at the heart of the reader's interests" : ''}).`,
    `- ⏩ ${label.skim}: only a few passages are worth it; give their timestamps.`,
    `- 📄 ${label.skip}: filler, thin content, clickbait title not delivered, or everything essential fits in a summary.`,
    ...(hasProfile ? [`- 🚫 ${label.off}: the topic is clearly outside the reader's interests.`] : []),
  ].join('\n');
}

// Finds the verdict by its emoji: robust even when the model translated the label.
export function parseVerdict(text) {
  const line = (text || '').split('\n').find((l) => /[✅⏩📄🚫]/u.test(l));
  if (!line) return null;
  const key = line.includes('🚫') ? 'off' : line.includes('✅') ? 'watch' : line.includes('⏩') ? 'skim' : 'skip';
  const reason = line
    .replace(/^[\s#*>-]*/, '')
    .replace(/^[✅⏩📄🚫]\s*/u, '')
    .replace(/^[^—–:|]{0,30}[—–:|]\s*/, '') // drop the (possibly translated) label
    .replace(/\*\*/g, '')
    .trim();
  return { v: key, reason };
}

// ------------------------------------------------------------------ Full summary

function systemPrompt(lang) {
  return [
    'You faithfully summarize YouTube videos from their transcript,',
    'which is often auto-generated (typos, missing punctuation, misspelled names: fix them when the context allows).',
    'Never invent anything that is not in the transcript. No introduction sentence, no polite closing.',
    `Write in ${languageOf(lang)}, in Markdown, section headings included.`,
  ].join(' ');
}

// The reader's interests are deliberately left out: asking for a summary means
// the reader already chose this video, so it is judged on its own merits.
function finalInstructions(lang, length) {
  const detailed = length === 'long';
  const h = outputLanguage(lang).headings;
  return `
Write the summary straight to the point: verdict and conclusion first, details afterwards. Follow exactly this structure, with these exact headings:

## ${h.verdict}
A single line starting with one of these emojis and its exact label, then " — " and the reason in one sentence:
${verdictCriteria(lang, false)}
Be demanding: the reader's time is precious.

## ${h.conclusion}
${detailed ? '2 to 4 sentences' : '1 to 2 sentences'}: the answer, verdict or final message of the video, as the author concludes it. Someone reading only this must know what the video concludes.

## ${h.takeaways}
${detailed ? '3 to 6' : '2 to 4'} bullets, from most to least important: the facts, figures or concrete advice to remember. Key term in **bold**.

## ${h.outline}
${detailed ? '8 to 15' : '4 to 7'} bullets in chronological order. Each bullet starts with the timestamp of the passage in brackets, e.g. [3:42], then the idea in one sentence${detailed ? ' or two' : ''}.`;
}

/**
 * @param {object} o
 * @param {string} o.base          Ollama URL
 * @param {string} o.model
 * @param {string} o.lang          key of OUTPUT_LANGUAGES (i18n.js)
 * @param {'short'|'long'} o.length
 * @param {object} o.meta          { title, author, lengthSeconds }
 * @param {Array}  o.segments      [{ start, text }]
 * @param {AbortSignal} o.signal
 * @param {(msg: string) => void} o.onStatus   UI status messages
 * @param {(chunk: string, full: string) => void} o.onToken
 */
export async function summarize({ base, model, lang, length, meta, segments, signal, onStatus, onToken }) {
  const common = { model, ...(await thinkOff(base, model)) };
  const system = { role: 'system', content: systemPrompt(lang) };

  const transcript = formatTranscript(segments);
  const chunks = splitChunks(transcript);

  let material = transcript;
  let label = 'Transcript (each line starts with its timestamp)';

  if (chunks.length > 1) {
    const notes = [];
    for (let i = 0; i < chunks.length; i++) {
      onStatus?.(t('readingPart', { i: i + 1, n: chunks.length }));
      const part = await chat(
        base,
        {
          ...common,
          options: { temperature: 0.2, num_ctx: numCtx(chunks[i].length) },
          messages: [
            system,
            {
              role: 'user',
              content: `${header(meta)}\nTranscript part ${i + 1}/${chunks.length}:\n<<<\n${chunks[i]}\n>>>\n\nExtract the main ideas of this part as 6 to 12 bullets. Each bullet starts with the [m:ss] timestamp of the passage. Bullets only.`,
            },
          ],
        },
        { signal },
      );
      notes.push(part.trim());
    }
    material = notes.join('\n');
    label = 'Timestamped notes taken over the whole video';
  }

  onStatus?.(t('writing'));
  return chat(
    base,
    {
      ...common,
      options: { temperature: 0.3, num_ctx: numCtx(material.length) },
      messages: [
        system,
        { role: 'user', content: `${header(meta)}\n${label}:\n<<<\n${material}\n>>>\n\n${finalInstructions(lang, length)}` },
      ],
    },
    { signal, onToken },
  );
}

// ------------------------------------------------------------------ Verdict only
// Fast variant for thumbnail badges: one line, no summary.

const VERDICT_CHARS = 36_000; // ~10k tokens: enough to judge, short enough to stay fast

function sampleForVerdict(transcript) {
  if (transcript.length <= VERDICT_CHARS) return transcript;
  // Beginning (the promise) and end (the conclusion): that is where the verdict is decided.
  const head = transcript.slice(0, VERDICT_CHARS * 0.65);
  const tail = transcript.slice(-VERDICT_CHARS * 0.35);
  return `${head.slice(0, head.lastIndexOf('\n'))}\n[…]\n${tail.slice(tail.indexOf('\n') + 1)}`;
}

export async function quickVerdict({ base, model, lang, interests, meta, segments, signal }) {
  const material = sampleForVerdict(formatTranscript(segments, 30));
  const hasProfile = !!interests?.trim();

  const out = await chat(
    base,
    {
      model,
      ...(await thinkOff(base, model)),
      options: { temperature: 0.2, num_ctx: numCtx(material.length), num_predict: 120 },
      messages: [
        {
          role: 'system',
          content: `You help a busy reader decide whether to watch a YouTube video, based on its transcript. Be demanding: their time is precious. Answer in ${languageOf(lang)}, on a single line.`,
        },
        {
          role: 'user',
          content: `${header(meta)}${hasProfile ? `\nReader's interests: ${interests.trim()}` : ''}
Transcript:
<<<
${material}
>>>

Answer with a single line: the emoji, then " — ", then the reason in 15 words at most.
${verdictCriteria(lang, hasProfile)}`,
        },
      ],
    },
    { signal },
  );
  return parseVerdict(out) || { v: 'skim', reason: out.trim().slice(0, 140) };
}

// ------------------------------------------------------------------ Fast triage on titles
// A single call for all visible thumbnails: discards whatever is clearly outside the
// briefing, without reading any transcript.

const TRIAGE_SCHEMA = {
  type: 'object',
  properties: {
    off_topic: {
      type: 'array',
      items: {
        type: 'object',
        properties: { n: { type: 'integer' }, reason: { type: 'string' } },
        required: ['n', 'reason'],
      },
    },
  },
  required: ['off_topic'],
};

/** @returns {Promise<Map<string, string>>} videoId → reason, for off-topic videos only */
export async function triageTitles({ base, model, lang, interests, items, signal }) {
  const off = new Map();
  if (!interests?.trim() || !items.length) return off;

  const list = items.map((it, i) => `${i + 1}. ${it.title}${it.channel ? ` (${it.channel})` : ''}`).join('\n');
  const out = await chat(
    base,
    {
      model,
      ...(await thinkOff(base, model)),
      format: TRIAGE_SCHEMA,
      options: { temperature: 0, num_ctx: 4096 },
      messages: [
        {
          role: 'system',
          content: `You filter YouTube videos for a busy reader, based only on their title and channel. Answer in JSON; write reasons in ${languageOf(lang)} (10 words at most).`,
        },
        {
          role: 'user',
          content: `Reader's interests: ${interests.trim()}

Videos:
${list}

List in "off_topic" the numbers of the videos whose topic is CLEARLY unrelated to these interests, or explicitly excluded by the reader.
When in doubt, or if the title is vague, do not list it: it will be analysed in more depth.`,
        },
      ],
    },
    { signal },
  );

  try {
    for (const { n, reason } of JSON.parse(out).off_topic || []) {
      const it = items[n - 1];
      if (it) off.set(it.id, reason);
    }
  } catch {
    /* unreadable answer: filter nothing */
  }
  return off;
}
