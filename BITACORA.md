# Bitácora de desarrollo

## 2026-07-13

### 28. Batch UX v0.10.0: el ciclo de vida de la sesión de lectura

Victor pidió una revisión general de la experiencia ("dale a todo"). El diagnóstico: lo difícil del RSVP ya estaba resuelto (ORP, auto-fit, delays por puntuación) — lo que faltaba era casi todo *ciclo de vida de la sesión*. Los dos arreglos que más dolían eran bugs, no features: (1) sin wake lock la pantalla se apagaba a mitad de capítulo (leer RSVP es mirar sin tocar), y (2) al pasar la app a background los timers throttleados seguían "avanzando" palabras que nadie veía — volvías decenas de palabras adelante. Ahora hay `navigator.wakeLock` en play/pausa y auto-pausa en `visibilitychange`. Sobre el núcleo: arranque en rampa (~59% de velocidad, acelera en 10 palabras), rebobinado de 4 palabras al reanudar, pausa de párrafo ×1.8 (tokenize colapsaba los `\n`), y palabras >14 chars en segmentos sucesivos ("dificultosam·"→"·ente,") en vez de encogerse. De paso encontré un off-by-one viejo: el delay se calculaba con la palabra *anterior*, así que la pausa de un punto aterrizaba sobre la primera palabra de la oración siguiente; ahora la demora cae sobre la palabra que la causa. Fricción menor: tap zones en el panel RSVP (izq −10 / centro play / der +10), barra de progreso seekeable, splitRatio persistente, `pointercancel` en el drag, temas sepia/claro para el panel de texto, buscador de biblioteca (>6 libros, sin tildes) y el autor de artículos que trafilatura ya extraía pero se descartaba. Verificado con harness Playwright local: 30/30. SW a `pivot-v15`.

### 23. El subdominio pasa a rsvp.yr.com.uy

Victor cambió el DNS del proyecto a `rsvp` pero el sitio no cargaba. Diagnóstico: el DNS ya apuntaba bien al VPS (`64.23.146.116`), pero faltaba la mitad del server. Como **ningún `server_name` de nginx matcheaba `rsvp`**, el request caía al primer server block cargado (`ai-flow`, el vecino del VPS compartido) — que servía la app equivocada ("Epson Image Platform") **con un cert expirado** (`CN=ai-flow.yr.com.uy`, vencido el 21-jun). El container `spritz-app` estaba healthy sirviendo Pivot en `:8035`; sólo faltaba wirearlo. Creé el vhost `rsvp` (proxy a `:8035`, desde `deploy/nginx-rsvp.conf`), emití cert Let's Encrypt con certbot (agrega el redirect 80→443) y recargué nginx. Verifiqué de afuera: HTTP 200, cert válido, sirviendo Pivot. Actualicé DEPLOY.md, renombré `nginx-pivot.conf`→`nginx-rsvp.conf` y apunté el manifest del TWA al dominio nuevo. Insight: **DNS ≠ online** — apuntar el A record sólo lleva el tráfico al server; el server todavía tiene que reconocer el hostname con un vhost y tener un cert válido para él.

### 24. La pivote no caía en la guía: de centrar-bloque a flex de 3 celdas

Victor notó que la letra roja del ORP no quedaba sobre la línea guía — la palabra estaba "corrida" y el ojo tenía que moverse. Causa: `renderWord` armaba `prefijo + <span.orp> + sufijo` y el `.word-display` los **centraba como bloque** (`text-align:center`), así que la pivote sólo caía sobre la retícula cuando prefijo y sufijo medían igual. En "ConceptSMILE," (ORP en la "e", índice 4 de 13) el centro del bloque caía entre la "t" y la "S", dejando la roja a la izquierda. Primer fix: layout **flex de 3 celdas** (`.wd-pre` / `.orp` / `.wd-post`) donde las laterales crecen igual (`flex:1 1 0`), empujando la pivote al centro exacto sin JS por palabra. Verifiqué con un harness headless en Chrome: Δ=0.00px en todos los largos. Bumpeé el SW a `pivot-v11` porque el HTML se cachea cache-first.

### 25. Chau APK nativo (TWA): la PWA es el único cliente

Con la web andando bien, Victor pidió sacar todo lo del APK nativo para limpiar el repo. Distinguí lo del **TWA** (a remover) de lo del **PWA** (se queda: `manifest.json` con `share_target`, el handler `/share-target` del SW). Removí de git `static/pivot.apk`, `static/.well-known/assetlinks.json`, `twa/twa-manifest.json` y `twa/.gitignore`; la ruta `/pivot.apk` de `main.py`; y las secciones de TWA en DEPLOY.md y README. El `twa/` local completo (proyecto Bubblewrap + **keystore**) lo borré con autorización explícita de Victor — corte definitivo (un APK futuro sería con firma nueva). `assetlinks.json` sólo servía para verificar el TWA, así que quedó muerto. Dejé intactas las entradas históricas de CHANGELOG/BITACORA y `ADR-001: PWA over native app` — que ahora quedó más vigente que nunca. Verifiqué en prod: `/pivot.apk` y `assetlinks.json` dan 404, el PWA intacto.

### 26. Service worker network-first: los deploys dejan de quedar "un reload atrás"

El celu de Victor seguía mostrando una versión vieja de la app después de un deploy. Manejando el sitio live con Playwright a 390px confirmé que **el código desplegado estaba correcto** (Δ=0 midiendo la pivote) — lo que veía era el `index.html` viejo cacheado. El SW era cache-first para el HTML: servía la copia cacheada al instante y recién en segundo plano detectaba el SW nuevo, así que la vista quedaba vieja hasta recargar de nuevo (el clásico "un reload atrás"), y a veces se trababa. Cambié las **navegaciones a network-first** (online = HTML fresco al instante; offline = fallback al cache); los assets siguen cache-first (rápidos, estables). Como toda la app está inline en `index.html`, el documento es lo único que cambia entre releases, así que con eso alcanza. Insight: bumpear `CACHE` en cada deploy era el síntoma; network-first es la cura.

### 27. Palabras largas que no entraban: auto-fit y retícula al 35%

En el celu, "dificultosamente," (más ancha que la pantalla) se cortaba a la derecha aunque la pivote estuviera centrada. El flex del punto 24 se rompía al desbordar: sin espacio libre positivo, `flex-grow` no balancea y `justify-content:center` recentra el bloque. Reescribí a **medición unificada**: un `.word-inner` inline-block con un solo `transform: translateX()+scale()` que clava la pivote en la retícula Y achica para caber (piso 0.4, sin reflow por palabra). Después Victor observó algo más fino y correcto: con la retícula al centro (50%), como el ORP cae a ~30% de la palabra, las largas quedaban cargadas a la derecha — "eso no tiene sentido". Le expliqué que la roja está a ~30% a propósito (es el Optimal Recognition Point, no el centro), y que la cura canónica de Spritz es mover la **retícula al ~35%** para que coincida con dónde cae el ORP. Le mostré un comparativo visual (30/35/40/50) y eligió 35%. `fitCurrentWord()` ahora ancla en `ORP_ANCHOR=0.35` con espacio asimétrico (izq 35% / der 65%), el lado más apretado capea la escala. Verifiqué el sitio live a 390px: la pivote en el 35% en todas las palabras, todo entra, las largas a tamaño casi completo. Detalle que engañó una medición temprana: el `clamp(32px,9vw,68px)` depende del **viewport**, no del panel — en un harness con viewport ancho la fuente daba 68px y exageraba el achique.

## 2026-07-06

### 14. El share target no aparecía en Android — diagnóstico WebAPK

Instalé la PWA en Android pero no aparecía como destino en el menú compartir, ni para archivos ni para páginas web. Investigué: el share target solo se registra si Chrome instala la PWA como **WebAPK** (un APK real que acuña un servidor de Google leyendo el manifest por HTTPS). Si la instalación fue un shortcut, o si el WebAPK se acuñó antes de que el manifest tuviera `share_target`, el destino nunca aparece — y Chrome re-chequea el manifest con throttle de días. Verifiqué el servidor: manifest 200 con `application/manifest+json`, share_target correcto. La causa raíz está en el dispositivo: hay que desinstalar y reinstalar desde Chrome. Documenté el procedimiento en DEPLOY.md.

### 15. Tres huecos reales del lado del servidor

Aunque la causa principal era el WebAPK viejo, encontré y cerré tres huecos: (1) `HEAD /manifest.webmanifest` devolvía 404 porque la ruta solo registraba GET y el HEAD caía al mount estático — agregué HEAD a ambas rutas de manifest. (2) El `accept` del share target no incluía `application/octet-stream`, que es el MIME con el que los file managers y WhatsApp comparten EPUBs y PDFs — sin eso la app no aparece para esos archivos ni con el WebAPK bien instalado (ADR-012). (3) El manifest publicitaba `.txt` pero `/api/upload` lo rechazaba — agregué `_extract_txt` (decode UTF-8 con replace, un capítulo único).

### 16. Ícono original — retícula ORP

El ícono era una "S" roja sobre negro que evocaba el branding de Spritz Inc. y no era IP nuestra. Lo reemplacé por un diseño geométrico original generado con Pillow: tres barras horizontales como una palabra, con el segmento del ORP en rojo levemente a la izquierda del centro, enmarcado por los ticks de alineación de la retícula del lector. Sin letras — nada que colisione con marcas ajenas. Generé las cuatro variantes (192/512, any/maskable) con supersampling 4x, y bumpeé el cache del SW a `spritz-v5` porque los íconos viejos estaban precacheados bajo las mismas URLs. Pendiente decidir si el nombre "Spritz" (marca registrada de Spritz Technology) también se cambia.

### 17. Rename: Spritz → Pivot

Decidimos el nombre nuevo: **Pivot**. Evalué opciones en tres familias (mecánica RSVP/ORP: Pívot, Mira, Orbe, Eje; cadencia: Tempo, Pulso; personalidad: Ipso, Erre) y verifiqué colisiones — "Fóvea", que era mi favorita conceptual, está triplemente tomada en la categoría (Fovea RSVP E-Reader, Foveal, fovea.rsvp). "Pivot" gana porque nombra la mecánica exacta: en la literatura RSVP la letra roja del ORP se llama *pivot letter*. El header quedó `P I VOT` con la I en rojo — que es justo el ORP que nuestro propio algoritmo calcularía para una palabra de 5 letras. Renombré manifest (el `id` no cambia, las instalaciones sobreviven), título, FastAPI, logger y docs; el target canónico pasa a `pivot.yr.com.uy`. Dejé sin tocar a propósito: las claves de localStorage (renombrarlas borraría el progreso de lectura de todos), los nombres de container/imagen, los paths del VPS y el repo de GitHub — todo eso va junto con la migración de DNS.

### 18. APK nativo con Bubblewrap (TWA)

Generé el APK sideloadeable contra el dominio temporal. Bubblewrap resultó tener dos trampas de setup: (1) su wizard interactivo del primer arranque se esquiva pre-creando `~/.bubblewrap/config.json` con `jdkPath` (exige JDK 17 — bajé Temurin a `~/Android/jdk/`) y `androidSdkPath`; (2) espera el layout viejo del SDK — busca `sdkmanager` en `<sdk>/bin/` y sus jars en `<sdk>/lib/`, no en `cmdline-tools/latest/` — y su invocación fallaba con ClassNotFoundException, así que pre-instalé `build-tools;34.0.0` y `platforms;android-34` con el sdkmanager real para que saltee su instalador. El build no interactivo va con las env vars `BUBBLEWRAP_KEYSTORE_PASSWORD`/`BUBBLEWRAP_KEY_PASSWORD`. Resultado: APK de 1 MB firmado (package `uy.com.yr.pivot`), share target como intent-filters nativos registrados al instalar — determinístico, sin depender del minting de Google. El keystore y sus passwords quedan gitignoreados en `twa/` (hay que backupearlos); `assetlinks.json` en `static/.well-known/` ata la huella SHA-256 al dominio para que corra sin barra de URL. El APK se distribuye desde el propio server en `/pivot.apk`.

### 19. Privacidad: la biblioteca se muda del servidor a IndexedDB

Victor descubrió que un documento de trabajo que subió por el share target quedó públicamente visible en la URL de la app — la biblioteca era server-side (`books/*.json`) y compartida entre todos los visitantes, herencia de cuando esto era una herramienta local single-user (ADR-009). Borré su archivo del server al toque y refactoricé la arquitectura (ADR-013): `/api/upload` ahora parsea en memoria y devuelve el libro completo sin escribir a disco; el navegador lo guarda en IndexedDB y toda la biblioteca (listado, capítulos, lectura, borrado con su botón nuevo) opera local. El Service Worker guarda él mismo en IndexedDB los libros compartidos (misma base por same-origin) antes de redirigir a `?book=`. Trampa que casi se escapa: el healthcheck del Dockerfile usaba `/api/books`, que dejó de existir — el container hubiera quedado unhealthy; ahora chequea `/manifest.webmanifest`. Costo asumido: biblioteca por-dispositivo (el teléfono y la desktop no comparten libros) y limpiar site data borra la biblioteca.

### 20. La biblioteca local madura: todo aterriza en ella

Con la biblioteca ya viviendo en IndexedDB, cerré la asimetría que quedaba: los archivos iban a la biblioteca pero las URLs y textos compartidos se leían "en el aire", sin progreso ni resume. Ahora `extractUrl`, el botón Leer y el `?text=` compartido crean libros locales con id de slug + hash SHA-256 del contenido (mismo esquema que el server → re-compartir la misma nota upsertea en vez de duplicar). Los libros de un solo capítulo saltean la vista de capítulos y van directo al lector. Sumé el hero "Continuar leyendo" (un tap → la palabra exacta donde quedaste, calculado del timestamp de progreso más reciente, salteando libros terminados), `navigator.storage.persist()` + indicador de espacio (crítico: si Android desaloja IndexedDB se pierde la biblioteca), export/import JSON de biblioteca completa (mitiga el trade-off por-dispositivo de ADR-013), covers con gradiente determinístico derivado del hash del id, y un cuento demo embebido de dominio público ("A la deriva", Quiroga — 1057 palabras bajadas de Wikisource) para el empty state. Todo verificado E2E en navegador real; el test me mordió una vez por contar el DOM antes del re-render async y otra por el SW viejo sirviendo HTML cacheado — para probar SW hay que limpiar registrations + Cache Storage, no solo IDB.

### 21. Estadísticas de lectura y presets de WPM

Agregué stats persistentes en localStorage: `tick()` acumula palabra + delay real en memoria y flushea cada 100 palabras, al pausar y al ocultarse la pestaña (mismo patrón que el progreso). La biblioteca muestra una tira de 4 tiles: racha de días, palabras hoy, palabras totales y WPM promedio — que sale de los delays reales, así que da menos que el nominal (581 vs 600 en el test) porque las pausas de puntuación cuentan: es la velocidad honesta. Detalle que casi muerde: las claves de día usan hora local y no `toISOString()` (UTC), porque en UY (UTC-3) el día UTC cambia a las 21:00 y partía las rachas. Historial diario capado a 90 días. Los presets de WPM (250/350/450/600) van bajo el slider con el activo resaltado, y de paso arreglé que el WPM no se persistía — cada reload volvía a 350; ahora vive en `spritz-wpm`. Verificado E2E: preset actualiza app/slider/storage, stats flushean al pausar, la tira renderiza, y el WPM sobrevive al reload.

### 22. Tamaño de fuente del panel ereader

Botones A−/A+ en la barra superior del lector: 12–24px con default en los 17px que ya tenía el CSS, persistido en `spritz-reader-fs`. Tras cada cambio se re-scrollea al span de la palabra actual porque el reflow cambia todas las alturas y te perdía la posición. Bonus del testing: el guard de "saltear libros terminados" del hero demostró funcionar solo — el demo quedó terminado de una corrida anterior y el hero desapareció como corresponde. Verificado E2E: incrementos aplican al computed style, clamp en 24 y 12, sobrevive al reload.

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
