# Pivot — Lector RSVP

Lector de velocidad RSVP con resaltado de la letra pívot (ORP) y panel split: RSVP arriba, texto abajo.

> El repo se llama `spritz-rsvp` por razones históricas; la app se llama **Pivot**
> desde v0.4.0 (el nombre "Spritz" es marca de Spritz Technology Inc.).

## Stack

- **Backend:** FastAPI + trafilatura + PyMuPDF
- **Frontend:** PWA (HTML/CSS/JS vanilla)

## Inicio rápido

```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8765
```

Abrir `http://localhost:8765` en el navegador.

## Estructura del proyecto

```
spritz-rsvp/
├── main.py                 # Servidor FastAPI (convertidor stateless)
├── static/
│   ├── index.html          # Frontend PWA (biblioteca en IndexedDB)
│   ├── manifest.json       # Manifiesto PWA
│   └── sw.js               # Service Worker
├── twa/                    # Proyecto Bubblewrap del APK nativo
└── requirements.txt        # Dependencias Python
```

## API Endpoints

El servidor no persiste contenido de usuarios (ADR-013): convierte y devuelve.
La biblioteca vive en IndexedDB del navegador.

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/extract` | Extraer texto desde URL (stateless) |
| `POST` | `/api/upload` | Convertir PDF/EPUB/TXT → libro JSON completo (stateless) |

## Características

- Algoritmo RSVP con highlighting ORP (Optimal Recognition Point)
- Delays variables para puntuación española (puntos, comas, signos de exclamación/interrogación)
- Parsing de EPUB por capítulos (OPF spine + NCX)
- Extracción de PDF vía PyMuPDF
- Biblioteca local en tu navegador (IndexedDB) — nada de lo que subís queda en el servidor
- Progreso de lectura guardado en localStorage
- Vista split con divisor arrastrable (RSVP arriba, texto abajo)
- Panel inferior de texto plano tipo ereader
- PWA instalable (WebAPK en Android)
- Web Share Target para recibir URLs, texto y archivos PDF/EPUB/TXT

## Licencia

MIT
