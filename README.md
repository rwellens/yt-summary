# YT Summary

Chrome extension (MV3) that, using a **local LLM through Ollama** (free, nothing leaves your machine):

- summarizes the YouTube video in the active tab, in the side panel: verdict → conclusion → key takeaways → timestamped outline;
- puts a badge on YouTube thumbnails: **✅ Worth watching / ⏩ Skim it / 📄 Summary is enough / 🚫 Not relevant**, with the reason on hover.

Interface in English or French; summaries in English, French, Dutch, German or Spanish.

## Install

1. Run Ollama with at least one model (`ollama pull gemma4:e4b`).
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and pick this folder.
3. Open a YouTube video, click the extension icon, then **Summarize the video**.

After changing the code: click ↻ on the extension card, then reload the YouTube tab.

## How it works

| File | Role |
|---|---|
| `src/transcript.js` | Injected in the page (MAIN world): transcript through the internal `get_panel` API, or by reading the "Transcript" panel as a fallback |
| `src/content.js` / `.css` | Thumbnail badges: finds visible thumbnails, triages them by title, fetches their transcript (`get_panel`) and asks the service worker for a verdict, one video at a time |
| `src/summarize.js` | Prompts, 20 s timestamped blocks, map → reduce above ~55k characters (≈ 1 h of video), quick verdict, title triage |
| `src/ollama.js` | Ollama HTTP client (NDJSON streaming) |
| `src/veille.js` | Optional link with a watch app: reuse its summaries and verdicts, send it new summaries |
| `src/i18n.js` | All user-facing text: UI strings (en / fr), summary headings and verdict labels per output language |
| `src/sidepanel.*` | UI: streamed summary, clickable timestamps (jump in the video), per-video cache, settings |
| `src/background.js` | Opens the panel, runs thumbnail verdicts (single queue), and strips the `Origin` header from the extension's requests to localhost (otherwise Ollama answers 403) |

Settings (top-right icon): interface language, summary server and model, thumbnail server and model (e.g. a local Ollama for thumbnails and a remote one for summaries), summary language, length (short / detailed), thumbnail verdicts on/off, interests briefing (used for thumbnail badges only: a summary you ask for is judged on its own merits, never flagged 🚫).

Optional **watch app** ("veille", a separate self-hosted app with the same small API): when set in the settings, summaries it already has are shown instantly, thumbnail verdicts it knows are reused without calling Ollama, and every new summary made here is sent to it (`GET /api/videos/<id>`, `GET /api/verdicts?ids=`, `POST /api/videos`). See `src/veille.js`.

Cache in `chrome.storage.local`: `sum:<videoId>` (summary) and `verdict:<videoId>` (badge; replaced by the full summary's verdict, which is more reliable). Verdicts are cleared when the briefing changes; both caches can also be cleared from the settings (**Re-analyse thumbnails**, **Clear saved summaries**).

### Thumbnail verdicts

1. **Title triage** (only when a briefing is set): a single Ollama call for all visible thumbnails, using structured JSON output, flags the videos clearly outside the briefing as 🚫 — no transcript is read. ~4 s for a screenful.
2. **Transcript verdict** for the others: ~0.3 s to fetch the transcript + ~10–15 s of Ollama (gemma4:e4b, 30-minute video).

### Fetching transcripts (Nov. 2026)

- The `timedtext` captions API returns an empty body without an anti-bot ("pot") token: unusable.
- The Transcript panel calls `POST /youtubei/v1/get_panel` with `panelId: "PAmodern_transcript_view"` and
  `params` = base64 protobuf that only wraps the video id (`aa 09 0f 0a 0b <id> 18 01`).
  It works from any youtube.com page, with a minimal client context.

## Known limitations

- Videos without captions (neither manual nor automatic) cannot be summarized.
- Only `/watch` pages are supported (no Shorts, no badges on Shorts).
- Badges keep Ollama busy while you browse YouTube: they can be turned off in the settings.
- YouTube changes its DOM and APIs regularly: `src/transcript.js` and `src/content.js` are the places to watch.

## License

[MIT](LICENSE)
