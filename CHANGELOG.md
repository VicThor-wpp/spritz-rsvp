# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.11.0] - 2026-07-13

### Added

- **Paragraph boundary dot.** A small red dot under the reticle appears while
  the last word of a paragraph (and the first of the next) is displayed, so the
  extended pause reads as "the text breathes here" instead of a glitch. It sits
  in the periphery of the fixation point — no eye movement needed.
- **Numbers and acronyms slow down** (×1.3 / ×1.2): they are decoded
  character-by-character, not recognized as word shapes.

### Changed

- **Long-word segmentation is now Spanish-syllable-aware.** Cuts fall on
  syllable boundaries (V-CV / VC-CV rule) and never split digraphs (ch, ll,
  rr) or inseparable onset clusters (pr, bl, tr, ...): "dificultosa·/·mente,"
  instead of "dificultosam·/·ente,". Falls back to hard cuts for words with no
  usable boundary or non-BMP chars (emoji).

### Fixed

- **ORP landed on punctuation.** The pivot index was computed over the raw
  token, so Spanish-frequent leading marks (¡ ¿ « — ") both received the pivot
  and inflated the word length: "¡Dorotea!" now pivots on the alphabetic core
  ("Dorotea") like a 7-letter word.
- SW cache bumped to `pivot-v16`.

## [0.10.0] - 2026-07-13

### Added

- **Screen wake lock while playing.** RSVP reading is hands-off, so the screen
  used to sleep mid-chapter; now `navigator.wakeLock` is acquired on play and
  released on pause/stop.
- **Ramp-up start and context rewind.** Playback starts at ~59% of the target
  speed and accelerates over the first 10 words; resuming after a pause rewinds
  4 words so you recover the thread without the manual `«` trip. Skips and
  seeks get a short 4-word ramp.
- **Paragraph pauses.** Tokenization now remembers which words close a
  paragraph (`split(/\s+/)` used to collapse the `\n`s) and the RSVP flow
  breathes ×1.8 on them.
- **Long-word segmentation.** Words over 14 chars display as successive
  segments ("dificultosam·" → "·ente,") instead of shrinking toward the 0.4
  scale floor; the ereader panel and progress still count them as one word.
- **Tap zones on the RSVP panel** (video-player pattern): left third −10 words,
  right third +10, center play/pause. Jumps during playback keep playing.
- **Seekable progress bar**: tap or drag to jump anywhere in the chapter.
- **Reader panel themes**: dark → sepia → light toggle (◐) for the bottom text
  panel; the RSVP panel stays dark. Persisted.
- **Library search** by title/author (accent-insensitive), shown when the
  library has more than 6 books.
- **Article author** from `/api/extract` (trafilatura metadata) now lands on
  the book card.
- Split-panel ratio persists across sessions.

### Fixed

- **Auto-pause when the app is hidden.** Backgrounded timers are throttled, so
  words kept "advancing" unseen and you came back dozens of words ahead.
- **Punctuation pause landed one word late**: the delay was computed from the
  previous word, so the lingering happened on the word *after* the period. The
  pause now sits on the word that causes it.
- **Split-handle drag could get stuck** when the system cancelled the gesture
  (incoming call, notification): `pointercancel` is now handled.
- SW cache bumped to `pivot-v15`.

## [0.9.0] - 2026-07-13

### Removed

- **Native Android APK (Trusted Web Activity)** and its whole toolchain — the
  web app / PWA is the only client now. Dropped `static/pivot.apk` and its
  `/pivot.apk` route, the `twa/` Bubblewrap project (including the signing
  keystore), and `static/.well-known/assetlinks.json` (Digital Asset Links,
  needed only to verify the TWA). PWA install and the share target are
  unaffected. Reverts to the original ADR-001 stance (PWA over native).

### Fixed

- **RSVP word alignment and fit.** The pivot (red ORP letter) now always sits on
  the guide line, and long words shrink to fit the panel instead of running off
  the right edge on mobile. Before, the whole word was block-centered, so the
  pivot only landed on the line when prefix and suffix were equal length (e.g.
  "ConceptSMILE," drifted left), and words wider than the screen overflowed. The
  word is now measured and positioned with a single `translateX()+scale()` on
  `.word-inner`: it scales down to fit (0.4 floor) and the reticle moved to 35%
  from the left — the ORP's natural position in a word — so words read balanced
  rather than right-loaded. Re-fits on resize/orientation. Verified across word
  lengths at 390px: pivot on the line, every real word fits. SW cache bumped
  through `pivot-v14`.

### Changed

- **Service worker is now network-first for navigations** (`pivot-v12`): the
  HTML shell is fetched from the network on every online load, with the cached
  copy as an offline fallback, so a deploy is visible on the next load instead
  of "one reload behind" a stale cache. Static assets (icons, manifest) stay
  cache-first. This fixes installed clients showing an old build after a deploy.
- **Production domain is now `rsvp.yr.com.uy`** (live 2026-07-13). Added the
  nginx vhost `deploy/nginx-rsvp.conf` and issued a Let's Encrypt cert; the app
  container (`spritz-app` on `:8035`) was already running. Updated `DEPLOY.md`;
  `deploy/nginx-pivot.conf` renamed to `deploy/nginx-rsvp.conf`.

## [0.8.1] - 2026-07-06

### Added

- Font size control for the ereader panel: A−/A+ buttons in the reader top bar, 12–24px range (default 17), persisted in `spritz-reader-fs`. After a resize the current word is scrolled back into view so the reflow never loses your place. SW cache `pivot-v10`.

## [0.8.0] - 2026-07-06

### Added

- **Reading stats** (localStorage `spritz-stats`): words read and actual reading time accumulate in memory during playback and flush every 100 words, on pause and on tab hide. The library shows a 4-tile strip — day streak, words today, total words, and *real* average WPM (computed from actual delays, so punctuation pauses count). Daily history capped at 90 days; dates use local time (UTC keys would flip the day at 21:00 in UY).
- **WPM presets** (250/350/450/600) under the slider, with the active one highlighted. WPM is now persisted (`spritz-wpm`) — it used to reset to 350 on every reload.

## [0.7.0] - 2026-07-06

### Added

- **Everything shared lands in the library**: extracted URLs and shared/pasted text are now saved as local books (client-side id = slug + SHA-256 content hash, same scheme as the server, so re-sharing upserts instead of duplicating). They get progress tracking and resume like files always did.
- **"Continuar leyendo" hero** at the top of the library: one tap jumps straight to the exact word where you left off in the most recently read (unfinished) book.
- **Library safeguard and portability**: `navigator.storage.persist()` requested on load (asks the browser not to evict IndexedDB under storage pressure), storage-usage indicator, and JSON export/import of the full library (books + progress) for backup and cross-device transfer.
- **Visual polish**: deterministic gradient covers per book (derived from the content-hash id), richer empty state, and an embedded public-domain demo story ("A la deriva", Horacio Quiroga) to try the reader in one tap.
- Single-chapter books (articles, texts) skip the chapters list and open straight into the reader.
- `.txt` accepted by the file picker (the backend already supported it).

### Changed

- Reader close/back/Escape now return to the library for single-chapter books (the chapters view only appears for multi-chapter books). SW cache bumped to `pivot-v8`.

## [0.6.0] - 2026-07-06

### Changed

- **Privacy by architecture (ADR-013): the server no longer stores user content.** `/api/upload` converts the file in memory and returns the complete book (chapter texts included); the browser stores it in IndexedDB (`pivot`/`books`). The public deployment was exposing every user's uploads to every visitor — now there is nothing server-side to expose.
- Library, chapter reading and the `?book=` share flow now operate on IndexedDB. The Service Worker writes shared files into IndexedDB itself (same-origin database) before redirecting.
- Removed: `/api/books*` endpoints, `books/` directory, its Docker volume, and the container healthcheck that depended on `/api/books` (now checks `/manifest.webmanifest`). SW cache bumped to `pivot-v7`.

### Added

- Per-book delete button in the library (removes the book from IndexedDB plus its localStorage progress keys).

### Notes

- The library is now per-device/per-browser: books are not shared between phone and desktop, and clearing site data clears the library. Reading progress model (localStorage) is unchanged.

## [0.5.0] - 2026-07-06

### Added

- Native Android APK (Trusted Web Activity via Bubblewrap), downloadable at `/pivot.apk`. Package `uy.com.yr.pivot`, signed locally; the share target is registered as native intent-filters at install time — no dependency on Google's WebAPK minting. Project in `twa/` (only `twa-manifest.json` is versioned; keystore is gitignored).
- `/.well-known/assetlinks.json` (Digital Asset Links) binding the signing key's SHA-256 to the domain so the TWA runs fullscreen without Chrome's URL bar.
- DEPLOY.md: TWA rebuild recipe and domain-migration checklist (the APK is bound to the temporary domain until `pivot.yr.com.uy` exists).

## [0.4.0] - 2026-07-06

### Changed

- **App renamed: Spritz RSVP → Pivot.** "Spritz" is a registered trademark of Spritz Technology Inc. for exactly this technology. "Pivot" names the mechanic: the red ORP letter is the pivot the eye locks onto. Manifest `name`/`short_name`, header (`P I VOT` with the I in accent red — the ORP of a 5-letter word), page title, FastAPI title, logger tag and docs all renamed. The manifest `id` is unchanged, so existing installs keep working and pick up the new label on their next WebAPK update (or reinstall).
- Canonical deploy target changed from `spritz.yr.com.uy` to `pivot.yr.com.uy` (DNS still pending; temporary vhost unchanged). `deploy/nginx-spritz.conf` renamed to `deploy/nginx-pivot.conf`.
- Service Worker cache bumped to `pivot-v6`.
- **Not renamed on purpose:** localStorage keys (`spritz-progress-*`, `spritz-read-*` — renaming would wipe reading progress), container/image names, VPS paths and the GitHub repo (documented in DEPLOY.md; deferred to the DNS migration).

## [0.3.0] - 2026-07-06

### Added

- Original icon set (ORP reticle design: word bars with the fixation point in accent red, framed by the reader's alignment ticks). Replaces the previous red "S" that echoed Spritz Inc.'s branding and was not our IP.
- `.txt` upload support in `/api/upload` — the share target manifest already advertised `text/plain`/`.txt` files but the backend rejected them.
- `application/octet-stream` in the share target `accept` list: Android file managers, WhatsApp and others share PDF/EPUB files with that generic MIME type, and the app was invisible in the share sheet for those files (ADR-012).

### Fixed

- `HEAD /manifest.webmanifest` and `HEAD /manifest.json` returned 404 (the FastAPI routes only registered GET; HEAD fell through to the static mount where only `manifest.json` exists). Both routes now serve GET and HEAD.
- Service Worker cache bumped to `spritz-v5` so clients pick up the new icons (the old ones were precached under the same URLs).

## [0.2.0] - 2026-06-12

### Added

- Per-word highlighting in the ereader panel: current word in accent red, already-read words greyed out, upcoming words at normal contrast (supersedes ADR-005 and ADR-006 via ADR-011).
- Click-to-seek: tap any word in the bottom panel to jump the RSVP to that word and continue playing from there.
- Smooth per-length delay curve in `wordDelay` (1-char words at 0.70x, ~6-char at 1.0x base, capped at 1.55x for 19+ chars) plus finer punctuation pauses (comma, semicolon, period, ellipsis, em-dash all distinct).
- Always-visible toast notification system for errors and confirmations.
- Python logging with `logger.exception()` on all backend error paths.
- Frontend global error handlers (`window.onerror` + `unhandledrejection`) wired to the toast.
- `fetchJSON` helper that validates `resp.ok` and surfaces server `{"error": "..."}` payloads as thrown errors.
- Project Gutenberg boilerplate detection in the EPUB parser: front/back-matter license chapters are skipped on upload.

### Fixed

- HTML injection in `renderEreaderText` and `renderWord` (any `<`, `>`, `&` in book text was breaking the DOM silently). Both now route through `esc()`.
- Use-after-close on the EPUB `ZipFile` in the fallback parsing path (`zf.close()` was called before the fallback ran). Switched to a `with` context manager.
- `errors="ignore"` silently dropping invalid UTF-8 bytes in EPUB decoding — changed to `errors="replace"` so corruption is visible (replacement chars) instead of vanishing.
- `read_text()` in three API endpoints had no explicit `encoding="utf-8"` — now always UTF-8.
- Service Worker was intercepting every POST (not just Web Share Target ones) because `e.request.url.includes("/")` is always true. Now uses `pathname === "/"` and content-type check.
- Service Worker fetch/formData paths had no `.catch()` — added explicit error handling and a 503 fallback response on network failure.
- Frontend `fetch()` calls had no `resp.ok` check; 5xx responses silently became "data" with missing fields. Centralized through `fetchJSON`.
- Error messages from chapter/book loads were written to a `#extract-status` div only visible on the input view, so users in reader/library/chapters never saw them. Routed through the toast system.
- Desktop layout overflow: body grew to ~8000px on a 1080px viewport, pushing controls below the fold. Caused by `min-height: 100dvh` plus missing `min-height: 0` on flex children. Fixed both.
- Old SW cache invalidation: bumped cache name to `spritz-v2` and added cleanup on activate.

## [0.1.0] - 2026-06-12

### Added

- ORP RSVP reader with Spritz algorithm
- URL extraction via trafilatura with browser-UA fallback
- EPUB chapter parsing (OPF spine + NCX TOC)
- PDF text extraction via PyMuPDF
- Book library with JSON persistence
- Chapter selection with progress resume
- Split view with draggable divider (RSVP top, text bottom)
- Plain text ereader panel
- PWA installable with Web Share Target
- Variable word delays for Spanish punctuation
