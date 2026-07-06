# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
