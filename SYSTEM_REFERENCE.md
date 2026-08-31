# PDF-to-Slides — Full Implementation & Deployment Reference

**Date:** August 29, 2026
**Repo:** `https://github.com/EM-ade/pdf-to-slides.git`
**Production URL:** `http://172.237.112.83:3005`
**Purpose:** This document is the single source of truth for the entire
PDF-to-Slides system — architecture, endpoints, configuration, the Linode
deployment, and known quirks. Hand this to any agent to connect, extend, or
troubleshoot.

---

## 1. What This System Does

Takes a PDF (or raw slide content) and produces an editable PowerPoint deck
with optional AI voiceover narration, plus an in-browser slide viewer with
playback controls.

**User workflow:**
1. Upload a PDF at the web UI (or POST to an API)
2. `presenton` (an AI presentation generator) converts it to a `.pptx`
3. (Optional) TTS generates per-slide narration, concatenated into one `voiceover.mp3`
4. (Optional) LibreOffice renders each slide to pixel-perfect PNGs
5. Output: `.pptx`, `.zip` (deck + audio), or a synced in-browser viewer / embeddable iframe

---

## 2. Architecture

```
[Browser / Embed iframe]
   │  POST /api/upload (PDF, multipart)  or  POST /api/embed (JSON content)
   ▼
[Node/Express app :3005  (Docker: novra-pdf-app-1)]
   │  pipeline.js
   │    processPDF()   — PDF → Presenton → pptx → (TTS) → (render) → manifest
   │    processContent() — content/array → Presenton → pptx → (TTS) → (render) → manifest
   ▼                                   ▲
[presenton :80  (Docker: novra-pdf-presenton-1)]   shared volume
   │  ghcr.io/presenton/presenton:latest             ./app_data:/app_data
   │  LLM: Command Code provider (xiaomi/mimo-v2.5)  └── app_data/
   │  Images: Pexels
   ▼
[Express static: ./decks/<deckId>/]
   ├── deck.pptx            editable PowerPoint
   ├── voiceover.mp3        concatenated narration (if voiceover)
   ├── deck.zip             pptx + mp3 bundle
   ├── manifest.json        metadata + slideTimings
   └── render.json          slide render spec (raster or composited)

[pdf2slides-renderer:latest]  — one-shot `docker run` per deck, headless
LibreOffice (pptx → PDF → PNGs @150dpi). Built via `npm run build:renderer`.

[OpenAI TTS]  — voiceover narration (default) — api.openai.com/v1/audio/speech
```

---

## 3. Services & Ports (Docker Compose)

| Service | Image | Internal port | Host port | Notes |
|---|---|---|---|---|
| `presenton` | `ghcr.io/presenton/presenton:latest` | 80 | 5001 | Slide generator; LLM = Command Code |
| `app` | `novra-pdf-app` (local build) | 3005 | 3005 | Express + pipeline |
| `renderer` | `pdf2slides-renderer:latest` | — | — | build-only profile; invoked via `docker run` |
| `tts` (Kokoro) | commented out | 8880 | 8880 | optional self-hosted TTS |

Current `.env` on production (non-secret keys):
```
PRESENTON_URL=http://localhost:5001
TTS_URL=https://api.openai.com/v1/audio/speech
TTS_VOICE=nova
PPT_TEMPLATE=general
PPT_SLIDES=10
PPT_TONE=educational
PPT_LANGUAGE=English
PPT_VERBOSITY=standard
PPT_INCLUDE_TITLE=true
PPT_INCLUDE_TOC=false
PORT=3005
NARRATION_REWRITE=1
SLIDES_REWRITE=1
USE_RENDERER=1
```
Secrets in `.env` (NOT committed): `CUSTOM_LLM_API_KEY`, `PEXELS_API_KEY`, `OPENAI_API_KEY`.
Optional: `API_TOKEN` (bearer auth), `EMBED_ALLOWED_ORIGINS`.

---

## 4. API Endpoints

### 4.1 `GET /api/health`
Health check. Returns `{"status":"ok"}`.

### 4.2 `POST /api/upload`
Upload a PDF and generate a deck.

- **Auth:** requires `Authorization: Bearer <API_TOKEN>` **only if** `API_TOKEN` is set in `.env`.
- **Body:** `multipart/form-data`, field `pdf` (max 50 MB, PDF-only)
- **Query params:** `voiceover=1` (enable narration), `slides=N` (1–50, override slide count)
- **Response (200):**
  ```json
  {
    "success": true,
    "deckId": "<uuid>",
    "manifest": {
      "deckId": "<uuid>",
      "title": "...",
      "slideCount": 10,
      "pptxUrl": "/decks/<id>/deck.pptx",
      "pptxBytes": 2287122,
      "presentationId": "<uuid>",
      "template": "general",
      "generatedAt": "...",
      "voiceoverUrl": "/decks/<id>/voiceover.mp3",
      "voiceoverBytes": 3112437,
      "voiceoverSlides": 10,
      "slideTimings": [{"index": 0, "start": 0, "end": 23.4}, ...],
      "viewerUrl": "/decks/<id>/view"
    },
    "downloadUrl": "/decks/<id>/deck.zip",
    "downloadBytes": 5258274
  }
  ```

### 4.3 `POST /api/embed`
Generate a presentation from **raw content** (no PDF) and get an iframe embed code.

- **Auth:** same `API_TOKEN` rule.
- **CORS:** GET always `*`; POST respects `EMBED_ALLOWED_ORIGINS` (default `*`).
- **Body (JSON, max 5 MB):**
  ```json
  {
    "content": "Welcome to Ethical Hacking|Phishing attacks exploit trust",
    "voiceover": true,
    "voice": "nova",
    "slides": 10,
    "template": "minimal",
    "tone": "educational",
    "language": "English",
    "autoplay": false
  }
  ```
  `content` = string (generation prompt) **or** array of slide texts (one per slide, sent as `slides_markdown`).
- **Response (200):**
  ```json
  {
    "success": true,
    "deckId": "<uuid>",
    "iframeSrc": "https://<host>/decks/<id>/view?embed=1&autoplay=0",
    "embedCode": "<iframe src=\"...\" width=\"960\" height=\"540\" frameborder=\"0\" allow=\"autoplay; fullscreen\" allowfullscreen></iframe>",
    "viewerUrl": "/decks/<id>/view",
    "manifest": { ... }
  }
  ```

### 4.4 `GET /api/decks`
List all generated decks.

```json
{ "decks": [
  { "deckId": "<uuid>", "title": "...", "slideCount": 10,
    "generatedAt": "...", "hasVoiceover": true,
    "viewerUrl": "/decks/<id>/view", "sizeBytes": 10660090 }
] }
```

### 4.5 `DELETE /api/decks/:deckId`
Delete one deck. Auth: `API_TOKEN` if set. Validates UUID-format id (blocks path traversal).

### 4.6 `GET /api/decks/:deckId/manifest`
Return one deck's `manifest.json`.

### 4.7 Static / viewer routes
- `GET /decks/<id>/deck.pptx` — the editable deck
- `GET /decks/<id>/voiceover.mp3` — narration
- `GET /decks/<id>/deck.zip` — pptx + mp3 bundle
- `GET /decks/<id>/render.json` — slide render spec
- `GET /decks/<id>/view` — in-browser viewer (`viewer.html`); `?embed=1` = embed mode; `?autoplay=1` = try autoplay

---

## 5. Viewer (`viewer.html`)

Self-contained HTML/CSS/JS, no build step. Two render modes (from `render.json`):
- **raster:** pre-rendered PNGs (via LibreOffice), pixel-perfect
- **composited:** text + images positioned from parsed PPTX XML (fallback)

**Controls (both modes):** Space play/pause, `←/→` prev/next slide, `R` restart, `F` fullscreen, `C` toggle editor mode.

**Embed mode (`?embed=1`):** hides topbar/float-btn/pill-hint, shows a slim bottom control strip (play/pause, prev/next, mute, restart, fullscreen, seek, time). `?autoplay=1` tries muted autoplay (browser may still block). Mute is independent of auto-advance.

---

## 6. Pipeline (`pipeline.js`)

- `processPDF(pdfPath, deckDir, { voiceover, slides })` — upload PDF → Presenton generate → fetch pptx → (voiceover) → (render) → manifest
- `processContent(contentInput, deckDir, { voiceover, slides, template, tone, language })` — same, content-driven
- Shared tail `finalizeDeck(deckDir, pptxPath, opts)` — voiceover + render + manifest write
- LLM helpers: `rewriteNarrationForStudents()` (teacher→student narration, `NARRATION_REWRITE=1`), `rewriteSlidesForClarity()` (polish slide text, `SLIDES_REWRITE=1`) — both use Command Code (same key/model)
- `generateVoiceover()` — per-slide TTS with parallel workers (`TTS_CONCURRENCY`), concat with 600ms silence, probes durations → `slideTimings`
- `renderSlidesViaLibreOffice()` — `docker run --rm -v <decks-parent>:/work pdf2slides-renderer:latest <pptx> <slides> 150`; falls back to compositor if image missing

---

## 7. Configuration (`.env`)

| Variable | Default | Notes |
|---|---|---|
| `CUSTOM_LLM_API_KEY` | (required) | Command Code key (LLM provider). Rotated 2026-08-29 |
| `CUSTOM_LLM_URL` | set in compose | `https://api.commandcode.ai/provider/v1` (do NOT quote in YAML!) |
| `CUSTOM_MODEL` | `xiaomi/mimo-v2.5` | LLM model (compose). Alternatives: `deepseek/deepseek-v4-flash`, `minimax/minimax-m3-free` |
| `PEXELS_API_KEY` | (required) | Stock photos for slides |
| `PRESENTON_URL` | `http://presenton` (compose) | Inside compose use service name + port 80. For host `npm start`, use `http://localhost:5001` |
| `TTS_URL` | `https://api.openai.com/v1/audio/speech` | OpenAI or Kokoro (`http://tts:8880/v1/audio/speech`) |
| `TTS_VOICE` | `nova` | OpenAI: `alloy/nova/shimmer/...`; Kokoro: `af_heart/...` |
| `TTS_MODEL` | `tts-1` | OpenAI TTS model |
| `TTS_CONCURRENCY` | `6` | Parallel TTS workers |
| `OPENAI_API_KEY` | (required for OpenAI TTS) | Voiceover |
| `PPT_TEMPLATE` | `general` | Presenton template |
| `PPT_SLIDES` | `10` | Default slide count (1–50) |
| `PPT_TONE` | `educational` | Presenton tone |
| `PPT_LANGUAGE` | `English` | Presenton language |
| `PPT_VERBOSITY` | `standard` | Presenton verbosity |
| `NARRATION_REWRITE` | `0` | Rewrite notes to student-facing via LLM |
| `SLIDES_REWRITE` | `0` | Polish on-screen text via LLM |
| `USE_RENDERER` | `1` | Use LibreOffice raster rendering |
| `API_TOKEN` | (empty) | If set, requires bearer auth on `/api/upload`, `/api/embed`, `DELETE /api/decks/:id` |
| `EMBED_ALLOWED_ORIGINS` | `*` | CORS allowlist for `POST /api/embed` |
| `PORT` | `3005` | Express port |
| `REQUEST_TIMEOUT_MS` | `600000` | 10-min request timeout |

---

## 8. Production Deployment (Linode)

- **Host:** `172.237.112.83` (Linode, Ubuntu 24.04, 4GB)
- **Path:** `/opt/novra-pdf`
- **Deploy:** `git pull origin main` → `docker compose build app` → `docker compose up -d`
- **Firewall (ufw):** allow `22`, `80`, `443`, `3005` (currently exposing `3005` directly, no TLS — testing only)
- **Container DNS:** pinned to `8.8.8.8`/`1.1.1.1` via `/etc/docker/daemon.json` (fixed `APIConnectionError`)
- **Renderer image:** built once via `npm run build:renderer` (~800 MB, LibreOffice headless)

**Deploy recipe:**
```bash
cd /opt/novra-pdf
git config --global --add safe.directory /opt/novra-pdf
git pull origin main
docker compose build app
docker compose up -d --force-recreate presenton app
docker exec novra-pdf-app-1 env | grep -E "PRESENTON_URL|TTS_URL|TTS_VOICE"
```

**Data dirs (bind mounts):**
- `./app_data` → Presenton artifacts (shared with presenton container)
- `./decks/<deckId>/` → generated output (pptx, mp3, pngs, render.json, manifest.json)
- `./uploads/` → temp PDF uploads

---

## 9. Troubleshooting History (what broke, what fixed it)

| Symptom | Root cause | Fix |
|---|---|---|
| `ECONNREFUSED 172.18.0.2:5001` | `PRESENTON_URL` pointed at `:5001` inside compose network | Use `http://presenton` (service name, port 80) — fixed in compose |
| `httpx.UnsupportedProtocol` in presenton logs | `CUSTOM_LLM_URL="https://..."` had literal double quotes in YAML | Remove quotes: `CUSTOM_LLM_URL=https://api.commandcode.ai/provider/v1` |
| Presenton `503 Connection error` | Container couldn't reach provider (DNS/IPv6) | Pinned Docker DNS to `8.8.8.8`/`1.1.1.1` via `daemon.json` + restart |
| Presenton `401 Invalid Authorization` | Old rotated Command Code key | Created new key at commandcode.ai; `models`=200 vs `chat`=401 indicated plan/key scope issue |
| Model `deepseek/deepseek-v4-flash` → 401 | Key/plan didn't allow that model | Switched to `xiaomi/mimo-v2.5` (works, HTTP 200) |
| Upload UI `404 /api/upload&slides=1` | JS built query string with `&` when voiceover off | Use `URLSearchParams` to build `?voiceover=1&slides=N` |
| TTS fails (no audio) | `TTS_URL=http://localhost:8880` but Kokoro container commented out | Set `TTS_URL=https://api.openai.com/v1/audio/speech`, `TTS_VOICE=nova` (OpenAI), recreate app |
| `docker compose` warning about `version:` | Obsolete attribute | Harmless; remove `version: '3.8'` when convenient |

---

## 10. Important Caveats / Gotchas

1. **Do not put double quotes around values in `docker-compose.yml`** env lines — they become part of the value.
2. **`PRESENTON_URL` differs by run mode:** compose → `http://presenton`; host `npm start` → `http://localhost:5001`.
3. **`localhost` inside a container is the container itself** — never use `localhost` for inter-service calls; use the service name.
4. **The renderer is invoked via host Docker socket.** The app container must have access to `docker` (it currently does in compose on the host). On Railway/serverless this breaks — `USE_RENDERER=0` falls back to text compositing.
5. **API keys must be rotated** — the old Command Code key (`user_2RiX...`), Pexels key, and OpenAI key (`sk-proj-NbKr...`) were exposed in a chat session. **Rotate them** and update `.env` on both the Linode and local machine.
6. **`git config --global --add safe.directory /opt/novra-pdf`** is required on the Linode for `git pull`.
7. **Kokoro TTS is optional and commented out** in compose; default TTS is OpenAI.
8. **No TLS/domain yet** — access is raw IP `http://172.237.112.83:3005`. Add Caddy/nginx + DNS when going to production.

---

## 11. Current Status

- [x] PDF → PPTX generation works (MiMo model, new Command Code key)
- [x] Slide count selection (UI + API + embed)
- [x] Deck deletion (UI + `DELETE /api/decks/:id`)
- [x] Embed API (`POST /api/embed`) + embed-mode viewer
- [x] Migration to Linode `172.237.112.83` complete
- [ ] **TTS fix pending deploy** (switch to OpenAI TTS, recreate app)
- [ ] Rotate exposed keys (Command Code, Pexels, OpenAI)
- [ ] Add TLS + domain (Caddy) for production
- [ ] Optional: Kokoro self-hosted TTS

---

## 12. Useful Commands (Linode)

```bash
# View logs
docker logs --tail 50 novra-pdf-app-1
docker logs --tail 50 novra-pdf-presenton-1

# Check env inside containers (masked)
docker exec novra-pdf-app-1 env | grep -E "TTS_URL|TTS_VOICE|PRESENTON_URL"
docker exec novra-pdf-presenton-1 env | grep -E "CUSTOM_LLM|CUSTOM_MODEL|PEXELS" | sed 's/=.*/=<set>/'

# Full restart
cd /opt/novra-pdf && docker compose down && docker compose build app && docker compose up -d

# List / delete decks
ls /opt/novra-pdf/decks/
rm -rf /opt/novra-pdf/decks/<deckId>
```

---

*Handoff-ready. All endpoints, URLs, config, and fixes documented above.*
