# YT Summary

Chrome extension (MV3) that summarizes the YouTube video in the active tab and puts "worth watching or not" badges on thumbnails, using an Ollama server (local, or any Ollama-compatible endpoint). See README.md for features and architecture.

## Rules

- Code, identifiers, code comments, prompts embedded in code and commit messages: **English only**. User-facing strings live in `src/i18n.js` (English and French).
- Public repository: no personal data, hostnames, tokens or internal infrastructure details in code, docs or commits.
- No build step, no dependencies: plain ES modules loaded by Chrome.
- After any change, tell the user to click ↻ on the extension card in `chrome://extensions`, then reload the YouTube tab (content scripts are only re-injected on reload).

## Where things are

| File | Role |
|---|---|
| `src/transcript.js` | Transcript extraction in the page (MAIN world): internal `get_panel` API, DOM panel fallback |
| `src/content.js` / `.css` | Thumbnail badges, status pill, analysis queue (one video at a time) |
| `src/summarize.js` | Prompts, map-reduce for long videos, quick verdict, title triage |
| `src/background.js` | Side panel opening, thumbnail jobs queue, Origin-stripping rule for localhost Ollama (403 otherwise), verdicts from the watch app |
| `src/veille.js` | Optional link with a self-hosted "veille" watch app (`GET /api/videos/<id>`, `GET /api/verdicts`, `POST /api/videos`) |
| `src/sidepanel.*` | Side panel UI and settings (summary server/model, thumbnail server/model, language, briefing, cache, watch app URL) |

## Known constraints

- YouTube changes its internals often: `get_panel` params are a base64 protobuf wrapping the video id (`aa 09 <len> 0a 0b <id> 18 01`). The same method is used by the watch app; a fix must go to both.
- Thumbnails must never use subscription-backed models (`*:max`): mass usage. The background refuses them.
- Shorts are not supported.

## Testing

No automated tests. Syntax check: `for f in src/*.js; do node --check --experimental-default-type=module $f; done`. Then load the unpacked extension and try a video.
