# Pivot — Production Deploy

> Infra names (`spritz-app` container, `spritz-rsvp` image, `/root/spritz` repo
> path, GitHub repo) keep the legacy "spritz" prefix — renaming them buys
> nothing and would break the running deploy recipe. The public domain is
> `rsvp.yr.com.uy`; the app is branded "Pivot".

## Current deployment

Live at **https://rsvp.yr.com.uy/** since 2026-07-13.

- **URL:** https://rsvp.yr.com.uy/
- **Container:** `spritz-app` on `127.0.0.1:8035`
- **Repo path on server:** `/root/spritz/`
- **nginx vhost:** `/etc/nginx/sites-available/rsvp` (from `deploy/nginx-rsvp.conf`)
- **SSL:** Let's Encrypt cert for `rsvp.yr.com.uy`, auto-renewed by certbot.

This VPS is shared. nginx has no explicit `default_server`, so any hostname
without a matching vhost falls through to the first server block loaded
(currently `ai-flow`) — which is why a missing `rsvp` vhost previously served
the wrong app under an expired cert. The `rsvp` vhost below fixes that.

## Canonical target

Target: **`rsvp.yr.com.uy`** → VPS at `64.23.146.116` → container on `127.0.0.1:8035`.

## Architecture

```
Internet
  │
  ▼
[ nginx (host, :443) ] ── SSL termination via Let's Encrypt
  │
  ▼
[ docker container spritz-app ] ── uvicorn :8000 inside, bound to :8035 on host

No user data is stored server-side (ADR-013): uploads are converted in
memory and the resulting book lives in the browser's IndexedDB.
```

## One-time setup

### 1. DNS

Add A record at your DNS provider for `yr.com.uy`:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | rsvp | 64.23.146.116 | 300 |

Verify propagation (may take 5-30 min):

```bash
dig +short rsvp.yr.com.uy
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
scp deploy/nginx-rsvp.conf root@64.23.146.116:/etc/nginx/sites-available/rsvp
ssh root@64.23.146.116 '\
  ln -sf /etc/nginx/sites-available/rsvp /etc/nginx/sites-enabled/rsvp && \
  nginx -t && systemctl reload nginx'
```

Obtain SSL certificate:

```bash
ssh root@64.23.146.116 'certbot --nginx -d rsvp.yr.com.uy --non-interactive --agree-tos --email admin@yr.com.uy --redirect'
```

### 3. Build and run

```bash
ssh root@64.23.146.116 'cd /root/spritz && \
  docker compose -f docker-compose.prod.yml build && \
  docker compose -f docker-compose.prod.yml up -d'
```

### 4. Verify

```bash
# Container serves the app (HTTP 200, title "Pivot — Lector RSVP")
ssh root@64.23.146.116 'curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8035/'
# Public URL with a valid cert (ssl_verify_result must be 0)
curl -fsS -o /dev/null -w "HTTP %{http_code} | ssl_verify=%{ssl_verify_result}\n" https://rsvp.yr.com.uy/
```

> Since v0.6.0 (ADR-013) the server stores no user content, so there is no
> `/api/books` endpoint to probe — a 200 on `/` is the health signal.

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

**None on the server** (since v0.6.0, ADR-013). Uploads are converted in memory
and returned to the client; books live in the browser's IndexedDB and reading
progress in localStorage. There is nothing to back up server-side — and nothing
a visitor can see of what another user uploaded.

## Install on Android (PWA)

1. Open the app URL in **Chrome** on Android (Firefox/Brave install shortcuts, not WebAPKs — no share target)
2. Tap menu (⋮) → **"Install app"** / "Add to Home screen" → **Install** (not "Create shortcut")
3. The Pivot icon appears on your home screen as a standalone app
4. Open any other app, tap **Share**, scroll → **Pivot** appears in the share targets

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
4. Verify: Android Settings → Apps → Pivot → the package name should start
   with `org.chromium.webapk.` — that confirms a real WebAPK. If the app is
   not listed there at all, it was installed as a shortcut.
5. The share sheet entry appears right after a successful WebAPK install
   (no reboot needed).

## Share Target supports:

- **URLs**: from browsers, X/Twitter, Reddit — auto-extracts article text
- **Plain text**: from any text selection or note — loads as readable text
- **Files**: PDF, EPUB and TXT — uploads directly to your library
  (also listed for `application/octet-stream`, the generic MIME most file
  managers use when sharing ebooks; unsupported formats get a clear error toast)
