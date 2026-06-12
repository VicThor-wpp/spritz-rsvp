# Architecture Decision Records

## ADR-001: PWA over native app

**Status:** Accepted

**Context:** Needed a cross-platform RSVP speed reader. Existing Android apps are abandoned or broken. Building native for multiple platforms is costly and slow to iterate.

**Decision:** Build a Progressive Web App (PWA) with a Python FastAPI backend and a vanilla HTML/CSS/JS frontend.

**Consequences:** Works on any device with a browser. Installable via PWA manifest. No app store review needed. Fast iteration cycle. Requires internet for backend features but can cache the frontend via service worker.

---

## ADR-002: FastAPI + trafilatura for extraction

**Status:** Accepted

**Context:** Need to extract readable text from arbitrary URLs. The extraction quality varies widely across sites.

**Decision:** Use FastAPI as the backend framework and trafilatura as the primary text extraction library, with a requests-based fallback using browser User-Agent.

**Consequences:** FastAPI provides async support and automatic OpenAPI docs. trafilatura handles most sites well. The fallback covers edge cases. Two extraction paths add minor complexity but significantly improve reliability.

---

## ADR-003: Browser UA fallback for URL fetching

**Status:** Accepted

**Context:** Some websites block or serve empty content to non-browser user agents. trafilatura alone fails on these sites.

**Decision:** When trafilatura returns empty or fails, retry with `requests` using a Chrome-like User-Agent string.

**Consequences:** Higher success rate for URL extraction. Adds one extra network request on failure path. Some sites may still block based on other signals.

---

## ADR-004: EPUB via OPF spine + NCX TOC

**Status:** Accepted

**Context:** EPUB files need chapter-level parsing. EPUBs vary widely in structure and metadata quality.

**Decision:** Parse the OPF spine to determine reading order and NCX to extract the table of contents. Fall back to spine-only if NCX is absent.

**Consequences:** Reliable chapter extraction for well-structured EPUBs. NCX-less EPUBs get numbered chapters without titles. Covers the vast majority of EPUB files in the wild.

---

## ADR-005: Plain text panel, no per-word spans

**Status:** Superseded by ADR-011

**Context:** The bottom text panel initially used one `<span>` per word for per-word highlighting. A typical chapter has ~7000 words, creating 7000 DOM elements that caused severe scroll lag and sluggish rendering.

**Decision:** Render the bottom panel as plain text paragraphs with percentage-based scroll positioning. No per-word DOM elements.

**Consequences:** Dramatically improved rendering performance and scroll smoothness. Lost the ability to highlight individual words in the bottom panel, which was an acceptable tradeoff.

---

## ADR-006: No highlighting in bottom panel

**Status:** Superseded by ADR-011

**Context:** The original design highlighted the current RSVP word in bold in the bottom reader panel. This was visually noisy and pulled attention away from the RSVP display.

**Decision:** Remove all bold/highlighting from the bottom panel. It serves as plain contextual reference text only.

**Consequences:** Cleaner visual experience. The bottom panel is purely for orientation and reference. All focus stays on the RSVP display.

---

## ADR-007: localStorage for progress

**Status:** Accepted

**Context:** Users need to resume reading where they left off. The backend already stores book content but doesn't track per-user reading position.

**Decision:** Store reading progress (book ID, chapter index, word index) in the browser's localStorage.

**Consequences:** Progress is per-device/browser, not synced across devices. Simple implementation with no backend changes. Sufficient for a single-user local deployment. If multi-user sync is needed later, this will need reworking.

---

## ADR-008: Split view with draggable divider

**Status:** Accepted

**Context:** A full-screen RSVP view provides no spatial context of where you are in the text. Users lose track of position in longer readings.

**Decision:** Implement a split view: RSVP display in the top panel, full text in the bottom panel, separated by a draggable divider.

**Consequences:** Users get spatial context while reading via RSVP. The draggable divider lets users adjust the panel ratio to their preference. More complex layout than a single panel but significantly better UX.

---

## ADR-009: JSON files for book storage

**Status:** Accepted

**Context:** Uploaded books and extracted text need persistent storage. This is a single-user local application.

**Decision:** Store each book as a JSON file in the `books/` directory. The filename is the book ID.

**Consequences:** Simple, human-readable, no database dependency. Easy to inspect and debug. Does not scale to concurrent writes or large libraries, but perfectly adequate for a local single-user tool.

---

## ADR-010: Web Share Target API

**Status:** Accepted

**Context:** Users want to send URLs from other apps (browser, Twitter, etc.) directly to the speed reader without copy-pasting.

**Decision:** Register the PWA as a Web Share Target via the manifest. Shared URLs are received as POST parameters and automatically extracted.

**Consequences:** Seamless URL sharing from other apps on mobile. Requires PWA to be installed. Only works on browsers that support Web Share Target API (Chrome, Edge, Samsung Internet).

---

## ADR-011: Per-word spans with O(1) class toggling and click-to-seek

**Status:** Accepted (supersedes ADR-005 and ADR-006)

**Context:** Users want visual context while reading via RSVP: see the current word highlighted in the bottom panel, see already-read words greyed out, and tap a word to seek-and-continue from there. ADR-005 removed per-word spans because constantly mutating bold styling on every span caused scroll lag. ADR-006 removed highlighting for the same reason. Modern browsers (and a smarter implementation) make this affordable again.

**Decision:** Wrap each word in a `<span class="w" data-i="N">` during initial render. State is encoded as one of three CSS classes — default (upcoming), `.passed`, `.current`. Updates are O(1) per tick: only the previous current loses its class and the new current gains it. Backward seeks are O(|delta|). The initial render of ~7000 spans is a one-time cost (<100ms on desktop, <300ms on mobile).

The previous performance problem was caused by mutating styles on every span every tick. The new approach mutates only the spans that change, leveraging `contain: layout style` to isolate reflows.

Click handler on the panel uses `e.target.closest('.w')` to detect word taps; tapping a word calls `seekToWord(i)` which jumps the RSVP and auto-resumes playback. Tapping non-word areas falls through to the existing `togglePlay()` behavior.

**Consequences:** Reading context is dramatically improved — users instantly see where they are in the text and what's coming next. Click-to-seek removes the need for scrubbing with the +/- 10 word buttons for large jumps. Initial render cost is one-time; per-tick cost was measured at 0.002ms (vs 170ms budget at 350 WPM), so playback is not affected. The bottom panel no longer doubles as a play/pause hit-zone for single-word taps, but empty-area taps still toggle play.
