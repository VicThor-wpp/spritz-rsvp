# Spritz RSVP — Production Deploy

## Current deployment (temporary)

While the DNS for `spritz.yr.com.uy` is not yet set up, the app reuses the
existing `thefuture100.yr.com.uy` vhost and its SSL cert.

- **URL:** https://thefuture100.yr.com.uy/
- **Container:** `spritz-app` on `127.0.0.1:8035`
- **Repo path on server:** `/root/spritz/`
- **The `thefuture100-app` container is untouched**, still running on
  `127.0.0.1:8030`. The original nginx vhost was backed up to
  `/etc/nginx/sites-available/thefuture100.backup-YYYY-MM-DD`.

To restore thefuture100 to that URL, replace
`/etc/nginx/sites-available/thefuture100` with the backup and reload nginx.

## Canonical target

When DNS for `yr.com.uy` is available, switch to `spritz.yr.com.uy`.
The recipe below documents that canonical setup.

Target: **`spritz.yr.com.uy`** → VPS at `64.23.146.116` → container on `127.0.0.1:8035`.

## Architecture

```
Internet
  │
  ▼
[ nginx (host, :443) ] ── SSL termination via Let's Encrypt
  │
  ▼
[ docker container spritz-app ] ── uvicorn :8000 inside, bound to :8035 on host
  │
  ▼
[ ./books/ volume ] ── persistent JSON storage
```

## One-time setup

### 1. DNS

Add A record at your DNS provider for `yr.com.uy`:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | spritz | 64.23.146.116 | 300 |

Verify propagation (may take 5-30 min):

```bash
dig +short spritz.yr.com.uy
# should output: 64.23.146.116
```

### 2. Server setup

Confirm port 8035 is free:

```bash
ssh root@64.23.146.116 'ss -tln | grep ":8035 " && echo PORT_USED || echo PORT_FREE'
# expected: PORT_FREE
```

Clone the repo on the server:

```bash
ssh root@64.23.146.116 'git clone https://github.com/VicThor-wpp/spritz-rsvp.git /root/spritz'
```

Install nginx vhost (HTTP only — certbot will add SSL automatically):

```bash
scp deploy/nginx-spritz.conf root@64.23.146.116:/etc/nginx/sites-available/spritz
ssh root@64.23.146.116 '\
  ln -sf /etc/nginx/sites-available/spritz /etc/nginx/sites-enabled/spritz && \
  nginx -t && systemctl reload nginx'
```

Obtain SSL certificate:

```bash
ssh root@64.23.146.116 'certbot --nginx -d spritz.yr.com.uy --non-interactive --agree-tos --email admin@yr.com.uy --redirect'
```

### 3. Build and run

```bash
ssh root@64.23.146.116 'cd /root/spritz && \
  docker compose -f docker-compose.prod.yml build && \
  docker compose -f docker-compose.prod.yml up -d'
```

### 4. Verify

```bash
ssh root@64.23.146.116 'curl -fsS http://127.0.0.1:8035/api/books'
curl -fsS https://spritz.yr.com.uy/api/books
# both should return: []
```

## Subsequent deploys

```bash
ssh root@64.23.146.116 'cd /root/spritz && \
  git pull && \
  docker compose -f docker-compose.prod.yml build && \
  docker compose -f docker-compose.prod.yml up -d'
```

## Operations

```bash
ssh root@64.23.146.116 'docker logs -f spritz-app'

ssh root@64.23.146.116 'cd /root/spritz && docker compose -f docker-compose.prod.yml ps'

ssh root@64.23.146.116 'cd /root/spritz && docker compose -f docker-compose.prod.yml restart app'

ssh root@64.23.146.116 'cd /root/spritz && docker compose -f docker-compose.prod.yml down'
```

## Persistent data

Books live at `/root/spritz/books/` on the host, mounted to `/app/books/` in the container.

- Survives `docker compose down/up`
- Survives `docker compose build` (no rebuild of volume)
- Survives `git pull` (books/ is gitignored)

Backup:

```bash
rsync -av root@64.23.146.116:/root/spritz/books/ ./books-backup-$(date +%F)/
```

## Install on Android (PWA)

1. Open the app URL in **Chrome** on Android (Firefox/Brave install shortcuts, not WebAPKs — no share target)
2. Tap menu (⋮) → **"Install app"** / "Add to Home screen" → **Install** (not "Create shortcut")
3. The Spritz icon appears on your home screen as a standalone app
4. Open any other app, tap **Share**, scroll → **Spritz RSVP** appears in the share targets

### Troubleshooting: app installed but missing from the share sheet

The share target only exists inside a **WebAPK** — a real APK that Google's
servers mint from the manifest when Chrome installs the PWA. Two common
failure modes:

- **Installed as a shortcut** (non-Chrome browser, or "Create shortcut" chosen,
  or minting silently failed): the share target is never registered.
- **Stale WebAPK**: installed before `share_target` existed in the manifest.
  Chrome only re-checks the manifest when the app is opened, throttled to
  ~1–3 days, so updates lag.

Fix (forces a fresh mint):

1. Uninstall the app (long-press icon → Uninstall / App info → Uninstall)
2. Chrome → ⋮ → Settings → Site settings → All sites → find the app's domain →
   **Clear & reset** (removes the old SW + cached manifest)
3. Reopen the URL in Chrome, wait for it to load fully, then ⋮ → **Install app**
4. Verify: Android Settings → Apps → Spritz → the package name should start
   with `org.chromium.webapk.` — that confirms a real WebAPK. If the app is
   not listed there at all, it was installed as a shortcut.
5. The share sheet entry appears right after a successful WebAPK install
   (no reboot needed).

### Share Target supports:

- **URLs**: from browsers, X/Twitter, Reddit — auto-extracts article text
- **Plain text**: from any text selection or note — loads as readable text
- **Files**: PDF, EPUB and TXT — uploads directly to your library
  (also listed for `application/octet-stream`, the generic MIME most file
  managers use when sharing ebooks; unsupported formats get a clear error toast)
