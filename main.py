"""Pivot — lector RSVP. FastAPI backend + static PWA."""

from __future__ import annotations

import hashlib
import io
import json
import logging
import re
import zipfile
from datetime import datetime
from pathlib import Path

import fitz  # PyMuPDF
import requests
import trafilatura
from fastapi import FastAPI, Request, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

# --- Logging -------------------------------------------------------------
# Always surface app logs to stderr regardless of uvicorn config.
logger = logging.getLogger("pivot")
if not logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(asctime)s | %(levelname)-7s | pivot | %(message)s"))
    logger.addHandler(_h)
    logger.setLevel(logging.INFO)
    logger.propagate = False

STATIC = Path(__file__).parent / "static"

app = FastAPI(title="pivot-rsvp")

FETCH_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,es;q=0.8",
}


# --- Helpers -------------------------------------------------------------


def _book_id(data: bytes, filename: str) -> str:
    """Stable ID from file content hash."""
    h = hashlib.sha256(data).hexdigest()[:12]
    stem = re.sub(r"[^a-z0-9]+", "-", Path(filename).stem.lower()).strip("-")
    return f"{stem}-{h}"


def _fetch_html(url: str) -> str | None:
    html = trafilatura.fetch_url(url)
    if html:
        return html
    try:
        r = requests.get(url, headers=FETCH_HEADERS, timeout=20)
        r.raise_for_status()
        return r.text
    except Exception:
        logger.exception("Failed to fetch URL via requests fallback: %s", url)
        return None


def _html_title(html: str) -> str:
    """Extract best title from an HTML fragment."""
    # Try <h1> first
    for tag in ("h1", "h2", "h3", "title"):
        m = re.search(rf"<{tag}[^>]*>(.*?)</{tag}>", html, re.S | re.I)
        if m:
            t = re.sub(r"<[^>]+>", "", m.group(1)).strip()
            if t:
                return t
    return ""


def _extract_pdf(data: bytes, filename: str) -> dict:
    doc = fitz.open(stream=data, filetype="pdf")
    title = (doc.metadata or {}).get("title", "") or Path(filename).stem
    pages = [page.get_text() for page in doc]
    doc.close()
    text = "\n\n".join(pages).strip()
    return {
        "title": title,
        "chapters": [{"title": title, "text": text, "words": len(text.split())}],
    }


def _extract_txt(data: bytes, filename: str) -> dict:
    text = data.decode("utf-8", errors="replace").strip()
    title = Path(filename).stem
    return {
        "title": title,
        "chapters": [{"title": title, "text": text, "words": len(text.split())}],
    }


_GUTENBERG_BOILERPLATE_TITLE_RE = re.compile(
    r"(project\s+gutenberg(?:\s*\u2122|\s*tm)?(?:\s+license)?"
    r"|gutenberg\s+trademark"
    r"|full\s+project\s+gutenberg)",
    re.I,
)
_GUTENBERG_BOILERPLATE_TEXT_MARKERS = (
    "*** START OF THE PROJECT GUTENBERG",
    "*** END OF THE PROJECT GUTENBERG",
    "THE FULL PROJECT GUTENBERG LICENSE",
    "PROJECT GUTENBERG LICENSE",
)


def _is_gutenberg_boilerplate(title: str, text: str) -> bool:
    if title and _GUTENBERG_BOILERPLATE_TITLE_RE.search(title):
        return True
    head = text[:1500].upper()
    return any(marker in head for marker in _GUTENBERG_BOILERPLATE_TEXT_MARKERS)


def _extract_epub(data: bytes, filename: str) -> dict:
    """Parse EPUB into structured chapters using OPF spine + TOC."""
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        try:
            container = zf.read("META-INF/container.xml").decode("utf-8", errors="replace")
            opf_match = re.search(r'full-path="([^"]+)"', container)
            opf_path = opf_match.group(1) if opf_match else ""
        except KeyError:
            opf_path = ""

        if not opf_path:
            for n in zf.namelist():
                if n.endswith(".opf"):
                    opf_path = n
                    break

        if not opf_path:
            logger.warning("EPUB %s has no OPF file", filename)
            return {"title": Path(filename).stem, "author": "", "chapters": []}

        opf_dir = str(Path(opf_path).parent) if "/" in opf_path else ""
        opf_xml = zf.read(opf_path).decode("utf-8", errors="replace")

        manifest: dict[str, str] = {}
        for m in re.finditer(r"<item\s+([^>]+)/?>", opf_xml, re.S):
            attrs = m.group(1)
            id_m = re.search(r'id="([^"]*)"', attrs)
            href_m = re.search(r'href="([^"]*)"', attrs)
            if id_m and href_m:
                manifest[id_m.group(1)] = href_m.group(1)

        spine_ids = re.findall(r'<itemref\s+idref="([^"]*)"', opf_xml)

        book_title = ""
        title_m = re.search(r"<dc:title[^>]*>(.*?)</dc:title>", opf_xml, re.S)
        if title_m:
            book_title = title_m.group(1).strip()
        if not book_title:
            book_title = Path(filename).stem

        author = ""
        author_m = re.search(r"<dc:creator[^>]*>(.*?)</dc:creator>", opf_xml, re.S)
        if author_m:
            author = author_m.group(1).strip()

        toc_titles: dict[str, str] = {}
        for name in zf.namelist():
            if name.endswith(".ncx"):
                try:
                    ncx = zf.read(name).decode("utf-8", errors="replace")
                    for pm in re.finditer(r"<navPoint[^>]*>.*?</navPoint>", ncx, re.S):
                        lbl_m = re.search(r"<text>(.*?)</text>", pm.group(0), re.S)
                        src_m = re.search(r'<content\s+src="([^"#]*)', pm.group(0))
                        if lbl_m and src_m:
                            src = src_m.group(1).split("#")[0]
                            toc_titles[src] = lbl_m.group(1).strip()
                except Exception:
                    logger.exception("Failed to parse NCX %s in %s", name, filename)

        chapters = []
        for sid in spine_ids:
            href = manifest.get(sid, "")
            if not href:
                continue
            if not any(href.lower().endswith(ext) for ext in (".html", ".xhtml", ".htm")):
                continue

            full_path = f"{opf_dir}/{href}" if opf_dir else href
            try:
                raw = zf.read(full_path).decode("utf-8", errors="replace")
            except KeyError:
                logger.warning("EPUB %s missing spine item: %s", filename, full_path)
                continue

            text = trafilatura.extract(raw, include_tables=False, favor_precision=True)
            if not text or len(text.split()) < 10:
                continue

            ch_title = toc_titles.get(href, "") or toc_titles.get(full_path, "")
            if not ch_title:
                ch_title = _html_title(raw)
            if not ch_title:
                ch_title = f"Capítulo {len(chapters) + 1}"

            if _is_gutenberg_boilerplate(ch_title, text):
                logger.info("Skipping Gutenberg boilerplate chapter: %s", ch_title)
                continue

            chapters.append({"title": ch_title, "text": text, "words": len(text.split())})

        if not chapters:
            logger.warning("EPUB %s: spine yielded no chapters, using fallback scan", filename)
            for name in sorted(zf.namelist()):
                if name.lower().endswith((".html", ".xhtml", ".htm")):
                    try:
                        raw = zf.read(name).decode("utf-8", errors="replace")
                    except KeyError:
                        continue
                    text = trafilatura.extract(raw, include_tables=False, favor_precision=True)
                    if not text or len(text.split()) < 10:
                        continue
                    ch_title = _html_title(raw) or f"Capítulo {len(chapters) + 1}"
                    if _is_gutenberg_boilerplate(ch_title, text):
                        continue
                    chapters.append({"title": ch_title, "text": text, "words": len(text.split())})

    return {"title": book_title, "author": author, "chapters": chapters}


# --- URL extract ---------------------------------------------------------


@app.post("/api/extract")
async def extract(request: Request) -> JSONResponse:
    body = await request.json()
    url = body.get("url", "").strip()
    if not url:
        return JSONResponse({"error": "url required"}, status_code=400)

    try:
        downloaded = _fetch_html(url)
        if not downloaded:
            return JSONResponse({"error": "could not fetch URL"}, status_code=422)
        text = trafilatura.extract(
            downloaded, include_tables=False, favor_precision=True
        )
        metadata = trafilatura.extract(
            downloaded, output_format="json", include_tables=False
        )
        title = ""
        author = ""
        if metadata:
            try:
                meta = json.loads(metadata)
                title = meta.get("title") or ""
                author = meta.get("author") or ""
            except (json.JSONDecodeError, TypeError):
                pass
        if not title:
            m = re.search(r"<title[^>]*>(.*?)</title>", downloaded, re.I | re.S)
            if m:
                title = re.sub(r"\s+", " ", m.group(1)).strip()
        if not text:
            return JSONResponse({"error": "could not extract text"}, status_code=422)
        return JSONResponse({"title": title, "author": author, "text": text, "url": url})
    except Exception as exc:
        logger.exception("URL extract failed: %s", url)
        return JSONResponse({"error": str(exc)}, status_code=500)


# --- File upload ---------------------------------------------------------
# Stateless by design (ADR-013): the file is parsed in memory and the full
# book (chapter texts included) is returned to the client, which stores it
# in its own IndexedDB. Nothing a user uploads is ever persisted server-side.


@app.post("/api/upload")
async def upload(file: UploadFile = File(...)) -> JSONResponse:
    filename = file.filename or "unknown"
    ext = Path(filename).suffix.lower()

    if ext not in (".pdf", ".epub", ".txt"):
        return JSONResponse(
            {"error": f"Formato no soportado: {ext}. Usá PDF, EPUB o TXT."},
            status_code=400,
        )

    data = await file.read()
    if len(data) == 0:
        return JSONResponse({"error": "Archivo vacío"}, status_code=400)

    try:
        if ext == ".pdf":
            result = _extract_pdf(data, filename)
        elif ext == ".epub":
            result = _extract_epub(data, filename)
        else:
            result = _extract_txt(data, filename)

        if not result.get("chapters"):
            return JSONResponse(
                {"error": "No se pudo extraer texto del archivo"}, status_code=422
            )

        result["id"] = _book_id(data, filename)
        result["author"] = result.get("author", "")
        result["added"] = datetime.now().isoformat()
        logger.info(
            "Converted book: %s (%d chapters)", result["title"], len(result["chapters"])
        )
        return JSONResponse(result)
    except Exception as exc:
        logger.exception("Upload failed: %s", filename)
        return JSONResponse({"error": str(exc)}, status_code=500)


# --- Share Target fallback ----------------------------------------------
# The Service Worker normally intercepts POST /share-target. If the SW is not
# active yet (first install, update pending), the POST hits the backend.
# Redirecting to "/" surfaces the home page so the user is not stranded on a 404.


@app.post("/share-target")
async def share_target_fallback():
    return RedirectResponse(url="/", status_code=303)


# --- Manifest -----------------------------------------------------------
# Chrome Android requires application/manifest+json to mint a WebAPK
# (and therefore to register the share target). Plain application/json
# from the static mount is not enough on some Chrome versions.


def _manifest_response() -> FileResponse:
    return FileResponse(
        str(STATIC / "manifest.json"),
        media_type="application/manifest+json",
        headers={"Cache-Control": "no-cache"},
    )


# HEAD included: without it, HEAD falls through to the static mount (no such
# file there) and returns 404, which trips PWA validators and looks broken.
@app.api_route("/manifest.webmanifest", methods=["GET", "HEAD"], include_in_schema=False)
async def manifest_webmanifest():
    return _manifest_response()


@app.api_route("/manifest.json", methods=["GET", "HEAD"], include_in_schema=False)
async def manifest_json():
    return _manifest_response()


# --- Static files (PWA) -------------------------------------------------

app.mount("/", StaticFiles(directory=str(STATIC), html=True), name="static")
