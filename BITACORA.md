# Bitácora de desarrollo

## 2026-06-12

### 1. Investigación inicial — PWA como decisión

Investigué varias apps RSVP para Android. Todas estaban abandonadas o con bugs sin arreglar. Ninguna ofrecía una experiencia decente de lectura continua. Decidí hacer una PWA: funciona en cualquier dispositivo, no necesitaría pasar por stores, y puedo iterar rápido con HTML/CSS/JS vanilla sobre un backend Python.

### 2. Primer prototipo RSVP + ORP + FastAPI

Armé el backend mínimo con FastAPI sirviendo un `index.html`. Implementé el algoritmo Spritz con cálculo de ORP (Optimal Recognition Point) por longitud de palabra. La velocidad base funcionaba, pero los tiempos se sentían mecánicos.

### 3. trafilatura falla en algunos sitios — fallback con requests

Al probar extracción de URLs con trafilatura, varios sitios devolvían vacío o error. Agregué un fallback con `requests` usando un User-Agent de navegador. Esto cubrió la mayoría de los casos que trafilatura no podía manejar.

### 4. Soporte para PDF y EPUB

Agregué upload de archivos. Para PDF usé PyMuPDF (`fitz`) para extraer texto página a página. Para EPUB armé un parser que lee el OPF spine y el NCX para armar la tabla de contenidos y dividir por capítulos. Ambos formatos quedan almacenados como libros en la biblioteca.

### 5. Biblioteca, capítulos y progreso

Implementé persistencia en archivos JSON dentro de `books/`. Cada libro tiene metadata, lista de capítulos y contenido. En el frontend agregué progreso de lectura guardado en `localStorage` para poder retomar donde se quedó.

### 6. Rediseño a vista split

El diseño original era RSVP a pantalla completa. Lo reemplacé por un panel split: RSVP arriba, texto abajo. Así se puede seguir la lectura lineal mientras se procesa con RSVP. Agregué un divisor arrastrable para ajustar el espacio.

### 7. Performance: de spans a párrafos

La primera versión del panel inferior usaba un `<span>` por palabra (unas 7000 spans en un capítulo típico). El DOM se volvía inmanejable y el scroll se trababa. Cambié a párrafos de texto plano con scroll por porcentaje. Mucho más rápido y liviano.

### 8. Sin bold en el panel inferior

Originalmente ponía en negrita la palabra actual del RSVP en el panel de texto abajo. Visualmente era ruidoso y distraía de la lectura RSVP. Lo eliminé: el panel de abajo ahora es texto plano sin resaltado, funciona como referencia contextual.

### 9. Auditoría completa + fix de bugs silenciosos

Audité el proyecto entero en navegador y encontré una pila de bugs que rompían el texto silenciosamente: inyección HTML sin escape en `renderEreaderText` y `renderWord` (cualquier `<`, `>`, `&` en el texto del libro mutaba el DOM), backend sin logging, errores ruteados a un div invisible cuando el usuario no estaba en la vista de input, `zf.close()` antes del fallback del parser de EPUB, `errors="ignore"` corrompiendo bytes, `read_text()` sin encoding explícito, y un Service Worker que interceptaba todos los POST. Agregué `esc()` en cada inyección de texto, sistema de toast siempre visible, `fetchJSON` helper con `resp.ok` check, global error handlers, Python logging con stack traces, y un skip de boilerplate de Project Gutenberg en el parser de EPUB.

### 10. Layout overflow destapado por el fix de XSS

El fix del escape de HTML destapó un bug latente de flexbox: como antes el texto se truncaba cuando había `<`, el `split-reader` tenía menos contenido y el overflow se disimulaba. Con el escape, el contenido completo se preservó (~5500px en una pantalla de 1080px) y los flex children sin `min-height: 0` crecían al tamaño de su contenido en lugar de scrollear. Resultado: el body crecía a 8000px y los controles quedaban fuera del viewport. Fix: `height: 100dvh` en body (en vez de `min-height`) y `min-height: 0` en todos los flex children scrolleables.

### 11. Vuelvo a meter spans en el panel inferior, con O(1) toggle

ADR-005 había sacado los spans por palabra por el lag. Volví a meterlos porque ahora se puede hacer barato: render inicial de los ~7000 spans (one-time cost), tracker de palabra actual con O(1) por tick (solo toggle de class en el span saliente y el entrante), y `contain: layout style` para aislar reflows. Tres estados: upcoming (gris claro, default), passed (gris oscuro, ya leído), current (rojo accent). Medí el costo del update y dio 0.002ms vs un budget de 170ms a 350 WPM. ADR-005 y ADR-006 quedan superseded por ADR-011.

### 12. Click en palabra para seek-and-continue

Aproveché los spans del paso anterior para que tocar una palabra haga `seekToWord(i)`: salta el RSVP al índice clickeado y arranca a leer desde ahí. El handler del panel ahora distingue entre tap sobre `.w` (seek) y tap en espacio vacío (toggle play/pause).

### 13. Curva suave de delay por longitud de palabra

`wordDelay` antes tenía dos thresholds binarios (`>10` y `>14`). Lo cambié a una curva más granular que va de 0.70x (1 char) a 1.55x (cap, 19+ chars), pasando por 1.0x base alrededor de 5-6 chars. Las pausas de puntuación también las hice más matizadas: coma 1.35x, punto y coma/dos puntos 1.5x, punto/exclamación/interrogación 1.85x, ellipsis 1.55x, em-dash 1.3x. Multiplicador combinado: una palabra larga terminada en punto pausa más que una corta terminada en punto.
