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

**Status:** Superseded by ADR-013

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

---

## ADR-012: `application/octet-stream` en el accept del Share Target

**Status:** Accepted

**Context:** Con el share target aceptando solo `application/pdf`, `application/epub+zip` y `text/plain`, la app no aparecía en el share sheet de Android al compartir archivos desde file managers, WhatsApp o Drive: esas apps suelen etiquetar EPUBs (y a veces PDFs) como `application/octet-stream`, el MIME genérico de binarios. Android filtra los destinos del share sheet por MIME declarado, no por extensión.

**Decision:** Agregar `application/octet-stream` a la lista `accept` de `share_target.params.files` en el manifest. La validación real del formato queda del lado del servidor: `/api/upload` decide por extensión (`.pdf`/`.epub`/`.txt`) y rechaza el resto con un error claro que el Service Worker convierte en toast (`?share-error=`).

**Consequences:** La app pasa a aparecer como destino para *cualquier* archivo binario (ZIPs, APKs, imágenes compartidas como octet-stream), no solo libros. Es ruido asumible: es el mismo trade-off que hacen los lectores de EPUB nativos, y el usuario que comparte un archivo no soportado recibe un mensaje inmediato en lugar de silencio. La alternativa (mantener la lista estricta) hacía invisible la app justo en el caso de uso principal — mandar un libro desde el file manager.

---

## ADR-013: Biblioteca client-side (IndexedDB) — el servidor no persiste contenido de usuarios

**Status:** Accepted (supersedes ADR-009)

**Context:** ADR-009 guardaba cada libro como JSON en `books/` del servidor, pensado cuando esto era una herramienta local single-user. Al deployarse en una URL pública, esa decisión se volvió un problema de privacidad: cualquier visitante veía la biblioteca completa de todos (un documento de trabajo subido por el autor quedó públicamente accesible). Lo que un usuario sube le pertenece a él, no a la web.

**Decision:** El servidor pasa a ser un convertidor efímero: `/api/upload` parsea el archivo en memoria (PyMuPDF/EPUB/TXT necesitan Python) y devuelve el libro completo — texto de capítulos incluido — sin escribir nada a disco. El cliente guarda el libro en IndexedDB (store `books`, database `pivot`) y toda la biblioteca (listado, capítulos, lectura, borrado) opera contra IndexedDB. El Service Worker, que comparte la base por same-origin, guarda él mismo los libros que llegan por Web Share Target antes de redirigir. Se eliminaron los endpoints `/api/books*`, el directorio `books/`, su volumen de Docker y el healthcheck que dependía de ellos.

**Consequences:** Privacidad por arquitectura — no hay nada que borrar del servidor porque nunca se guarda. Sin límite práctico de tamaño (IndexedDB maneja cientos de MB). El costo: la biblioteca es por-dispositivo/por-navegador (el teléfono y la desktop no comparten libros — re-subir el archivo en cada dispositivo), y limpiar los datos del sitio en el navegador borra la biblioteca. El progreso de lectura ya vivía en localStorage, así que su modelo no cambia.
