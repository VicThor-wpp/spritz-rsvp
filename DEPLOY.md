# Pivot — Production Deploy

> Infra names (`spritz-app` container, `spritz-rsvp` image, `/root/spritz` repo
> path, GitHub repo) keep the legacy "spritz" prefix until the DNS migration to
> `pivot.yr.com.uy` — renaming them buys nothing and would break the running
> deploy recipe.

## Current deployment (temporary)

While the DNS for `pivot.yr.com.uy` is not yet set up, the app reuses the
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

When DNS for `yr.com.uy` is available, switch to `pivot.yr.com.uy`.
The recipe below documents that canonical setup.

Target: **`pivot.yr.com.uy`** → VPS at `64.23.146.116` → container on `127.0.0.1:8035`.

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
| A | pivot | 64.23.146.116 | 300 |

Verify propagation (may take 5-30 min):

```bash
dig +short pivot.yr.com.uy
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
scp deploy/nginx-pivot.conf root@64.23.146.116:/etc/nginx/sites-available/pivot
ssh root@64.23.146.116 '\
  ln -sf /etc/nginx/sites-available/pivot /etc/nginx/sites-enabled/pivot && \
  nginx -t && systemctl reload nginx'
```

Obtain SSL certificate:

```bash
ssh root@64.23.146.116 'certbot --nginx -d pivot.yr.com.uy --non-interactive --agree-tos --email admin@yr.com.uy --redirect'
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
curl -fsS https://pivot.yr.com.uy/api/books
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

## Native APK (TWA via Bubblewrap)

A sideloadable APK lives at `https://<domain>/pivot.apk`. It is a **Trusted Web
Activity**: a ~2 MB shell that opens the deployed web app fullscreen in Chrome.
Web deploys reach installed APKs instantly — rebuild only when the app identity
changes (name, icons, share_target, **domain**).

Why bother when the WebAPK exists: the TWA registers its share target as native
intent-filters **at install time** — deterministic, no Google minting involved.

### Project layout

- `twa/twa-manifest.json` — the only versioned file; Android project regenerates from it
- `twa/android.keystore` + `twa/keystore.properties` — signing identity, **gitignored,
  BACK THEM UP** (losing them = installed APKs can't be updated, only uninstall/reinstall)
- `static/.well-known/assetlinks.json` — Digital Asset Links: ties the signing key's
  SHA-256 to the domain so the APK runs without Chrome's URL bar
- Toolchain (local machine): Android SDK at `~/Android/Sdk` (with `bin`/`lib`
  symlinks into `cmdline-tools/latest/` — Bubblewrap expects the old layout),
  Temurin JDK 17 at `~/Android/jdk/`, paths wired in `~/.bubblewrap/config.json`

### Rebuild

```bash
cd twa/
export BUBBLEWRAP_KEYSTORE_PASSWORD=$(grep keystorePassword keystore.properties | cut -d= -f2)
export BUBBLEWRAP_KEY_PASSWORD=$(grep keyPassword keystore.properties | cut -d= -f2)
bubblewrap update --skipVersionUpgrade   # regenerate project after twa-manifest.json edits
bubblewrap build --skipPwaValidation     # → app-release-signed.apk
cp app-release-signed.apk ../static/pivot.apk
# bump appVersionCode in twa-manifest.json on every release
```

### Domain migration checklist (thefuture100 → pivot.yr.com.uy)

1. Update `host`, `webManifestUrl`, `fullScopeUrl`, `iconUrl`, `maskableIconUrl`
   in `twa/twa-manifest.json`; bump `appVersionCode`
2. Rebuild (same keystore — the fingerprint and `assetlinks.json` stay valid)
3. Users must install the new APK (the old one points at the old domain)

### Share Target supports:

- **URLs**: from browsers, X/Twitter, Reddit — auto-extracts article text
- **Plain text**: from any text selection or note — loads as readable text
- **Files**: PDF, EPUB and TXT — uploads directly to your library
  (also listed for `application/octet-stream`, the generic MIME most file
  managers use when sharing ebooks; unsupported formats get a clear error toast)
