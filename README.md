# Spritz RSVP — Lector de velocidad

RSVP speed reader tipo Spritz con panel split: RSVP arriba, texto abajo.

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
├── main.py                 # Servidor FastAPI
├── static/
│   ├── index.html          # Frontend PWA
│   ├── manifest.json       # Manifiesto PWA
│   └── sw.js               # Service Worker
├── books/                  # Almacenamiento de libros (JSON)
└── requirements.txt        # Dependencias Python
```

## API Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/extract` | Extraer texto desde URL |
| `POST` | `/api/upload` | Subir PDF/EPUB y crear libro |
| `GET` | `/api/books` | Listar biblioteca |
| `GET` | `/api/books/{id}` | Obtener libro |
| `GET` | `/api/books/{id}/chapters/{idx}` | Obtener capítulo |
| `DELETE` | `/api/books/{id}` | Eliminar libro |

## Características

- Algoritmo RSVP con highlighting ORP (Optimal Recognition Point)
- Delays variables para puntuación española (puntos, comas, signos de exclamación/interrogación)
- Parsing de EPUB por capítulos (OPF spine + NCX)
- Extracción de PDF vía PyMuPDF
- Biblioteca de libros con persistencia JSON
- Progreso de lectura guardado en localStorage
- Vista split con divisor arrastrable (RSVP arriba, texto abajo)
- Panel inferior de texto plano tipo ereader
- PWA instalable
- Web Share Target para recibir URLs externas

## Licencia

MIT
