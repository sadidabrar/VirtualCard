# VirtualCard — Multi-Tenant Liquid Glass Business Card Platform

A self-contained, multi-tenant digital business card platform served on a wildcard subdomain architecture (`https://<username>.virtualcard.duckdns.org`) with a marketing root site, owner editor, high-resolution QR/vCard generation, and master admin panel — crafted in an Apple-inspired Liquid Glass UI.

---

## Architecture Overview

VirtualCard separates HTTP concerns cleanly across a layered TypeScript + Express 5 architecture backed by SQLite (WAL mode) and Drizzle ORM:

- **`src/routes/`**: HTTP route wiring only (middleware ordering, CSRF, rate limiters, controller binding).
- **`src/controllers/`**: Request parsing/content-negotiation (`HTML` vs `Accept: application/json`), service calls, response shaping.
- **`src/services/`**: Business logic (`AuthService`, `TenantService`, `CardService`, `MasterService`, `QrService`, `HealthService`).
- **`src/repositories/`**: All SQLite database access via Drizzle ORM (`UserRepository`, `CardRepository`, `HealthRepository`) with dependency injection.
- **`src/middleware/`**: `requestId` (UUID + Pino structured logging), `tenant` (`Host` / `X-Forwarded-Host` resolution), `auth` (`requireAuth`, `requireTenantOwner`, `requireMaster`), `csrf`, `rateLimit`, and centralized `errorHandler`.
- **`src/validators/`**: Zod input validation on every mutating endpoint, lookup parameter, and route param.
- **`src/views/` & `public/`**: Server-rendered EJS templates (`<%=` escaped for all dynamic user content) styled with a self-hosted `@fontsource/inter` Liquid Glass CSS design system and progressive-enhancement JS (`scriptSrc: ["'self'"]`).

---

## Domain & Subdomain Routes

### Root Domain (`virtualcard.duckdns.org`)
| Method & Path | Description |
| :--- | :--- |
| `GET /` | Marketing landing page & quick username claim bar |
| `GET /demo` | Interactive Liquid Glass component & accessibility sandbox |
| `GET /signup`, `POST /signup` | Multi-step account creation + optional avatar upload + instant provisioning |
| `GET /signup/success` | Provisioned URL + 2048px QR preview & download page |
| `GET /login`, `POST /login`, `POST /logout` | Username/email authentication & cross-subdomain SQLite session management |
| `GET /api/username-available?u=<name>` | Debounced JSON availability check (`30 req/min`) |
| `GET /u/:username` | HTTP `301` redirect to `https://<username>.virtualcard.duckdns.org` |
| `GET /master`, `GET /master/users/:id`, `POST /master/users/:id`, `POST /master/users/:id/status`, `POST /master/users/:id/reset-password`, `DELETE /master/users/:id`, `POST /master/users/:id/delete`, `GET /master/export.csv`, `GET /master/export.json` | Master administrator directory, KPI tiles, search/filter/pagination, full card editor, suspend/reactivate, password reset, account deletion, formula-safe CSV & JSON exports |

### Tenant Subdomain (`<username>.virtualcard.duckdns.org`)
| Method & Path | Description |
| :--- | :--- |
| `GET /` | Public mobile-first card (`404` if suspended, unknown, or unpublished to visitors; owner preview allowed) |
| `GET /edit`, `POST /edit`, `POST /edit/avatar` | Owner card editor (`requireTenantOwner` enforces matching subdomain & user ID) |
| `GET /qr.png?size=2048` | High-resolution Error Correction Level `H` PNG QR code (`128`–`4096` px) |
| `GET /qr.svg` | Crisp vector SVG QR code |
| `GET /vcard` | Standard vCard 3.0 `.vcf` contact export |
| `POST /logout` | Logs out current session directly from tenant subdomain |

### Operational & Health Endpoints
| Method & Path | Description |
| :--- | :--- |
| `GET /healthz` | Liveness check (`{ "ok": true, "data": { "status": "alive" } }`) — bypasses tenant middleware |
| `GET /readyz` | Readiness check verifying SQLite connectivity and current Drizzle migrations |

---

## Quick Start (Local Development Without Wildcard DNS)

### Prerequisites
- Node.js **22 LTS**
- npm

### Setup & Run
```bash
cp .env.example .env
# Edit .env with your MASTER_EMAIL, MASTER_USERNAME, MASTER_PASSWORD, and SESSION_SECRET

npm install
npm run migrate
npm run seed
npm run dev
```

When running locally without wildcard DNS:
- **Subdomain emulation via `.localhost`**: Chromium and Firefox resolve `http://<username>.localhost:3000` to `127.0.0.1` automatically without editing hosts files.
- **Query fallback (development mode only)**: Append `?__tenant=<username>` (for example, `http://localhost:3000/?__tenant=master` or `http://localhost:3000/edit?__tenant=alice`). In `NODE_ENV=production`, `?__tenant` and `X-Debug-Tenant` overrides are strictly ignored.

---

## Native Container / VPS Deployment (Debian & Ubuntu LXC, No Docker)

For fresh **Debian 12/13 or Ubuntu 22.04/24.04 containers (Proxmox LXC or VPS)** running behind an external reverse proxy such as **Nginx Proxy Manager**, use [scripts/install-ubuntu-debian.sh](scripts/install-ubuntu-debian.sh) to install Node.js 22 LTS, build tools, Drizzle SQLite migrations/seed, and `virtualcard.service` listening on port `3000`:

1. Ensure this repository is pushed to a Git remote accessible from the container.
2. Run as `root` inside the container:
   ```bash
   apt-get update && apt-get install -y git && git clone -b master https://github.com/sadidabrar/VirtualCard.git /opt/virtualcard && bash /opt/virtualcard/scripts/install-ubuntu-debian.sh
   ```
   *(Pass `WITH_CADDY=true` if you do not have an external reverse proxy and want local Caddy + DuckDNS DNS-01 TLS installed inside the same container.)*
3. Point **Nginx Proxy Manager** at `http://<container-ip>:3000` for domains `<base-domain>` and `*.<base-domain>` with HTTPS/SSL enabled. VirtualCard configures `app.set('trust proxy', 1)` so `Host`, `X-Forwarded-Host`, and `X-Forwarded-Proto` work automatically.
4. Inspect service, logs, and readiness:
   ```bash
   systemctl status virtualcard
   journalctl -u virtualcard -f
   curl -f http://127.0.0.1:3000/readyz
   ```
5. Persistent state lives under `/opt/virtualcard/data/db/virtualcard.db` and `/opt/virtualcard/data/uploads`.

---

## Production Deployment (Docker + Custom Caddy DNS-01 TLS)

### 1. DuckDNS Wildcard DNS Setup
1. Log in at [duckdns.org](https://www.duckdns.org/) and ensure your subdomain (`virtualcard.duckdns.org`) points to your server's public IPv4 address.
2. DuckDNS automatically resolves all sub-subdomains (`*.virtualcard.duckdns.org`) to the same A record as the apex domain.
3. Verify DNS propagation before requesting certificates:
   ```bash
   dig +short virtualcard.duckdns.org
   dig +short smoke-test.virtualcard.duckdns.org
   ```
   Both commands must return the same server IP address.

### 2. Custom Caddy Image & Wildcard TLS (DNS-01)
HTTPS uses a **single wildcard TLS certificate** issued via ACME DNS-01 challenge covering both `virtualcard.duckdns.org` and `*.virtualcard.duckdns.org` (`on-demand TLS` is intentionally omitted because DNS-01 covers all subdomains under one certificate):
- `Dockerfile.caddy` builds Caddy with `xcaddy build --with github.com/caddy-dns/duckdns`.
- `Caddyfile` configures `tls { dns duckdns {$DUCKDNS_TOKEN} }` and forwards `Host` and `X-Forwarded-Host` cleanly to `app:3000`.
- `Dockerfile` uses **`node:22-bookworm-slim`** (glibc for Sharp and `better-sqlite3`), runs `node dist/db/migrate.js && node dist/db/seed.js` on startup, runs as non-root `node`, and gracefully drains in-flight requests within 12 seconds on `SIGTERM`/`SIGINT`.

### 3. Configure Environment & Launch
```bash
cp .env.example .env
```
Ensure `.env` production secrets meet strict boot validation (`src/lib/env.ts`):
- `BASE_DOMAIN=virtualcard.duckdns.org`
- `SESSION_SECRET` — at least **32 random characters** (required in production)
- `MASTER_PASSWORD` — at least **12 characters** (required in production)
- `MASTER_USERNAME`, `MASTER_EMAIL`
- `DUCKDNS_TOKEN` — your DuckDNS API token

Start the stack:
```bash
docker compose up -d --build
```

Inspect logs & health:
```bash
docker compose ps
docker compose logs -f app caddy
curl -f http://127.0.0.1/readyz # or https://virtualcard.duckdns.org/readyz
```

---

## Persistent Volumes & SQLite Backup / Restore

The stack persists state across three named Docker volumes:
- `virtualcard_db` (`/app/data/db`) — SQLite database + WAL files + session store
- `virtualcard_uploads` (`/app/data/uploads`) — WebP avatar uploads (512×512, EXIF stripped)
- `caddy_data` / `caddy_config` — Wildcard TLS certificates & ACME account keys

### Safe Online Backup (`sqlite3 .backup`)
Never `cp` a live WAL-mode SQLite file while the server is writing. Use SQLite's online `.backup` API inside the running container:
```bash
# Back up SQLite database atomically
docker exec virtualcard_app sqlite3 /app/data/db/virtualcard.db ".backup '/app/data/db/virtualcard-backup.db'"
docker cp virtualcard_app:/app/data/db/virtualcard-backup.db ./backups/virtualcard-$(date +%F).db
docker exec virtualcard_app rm -f /app/data/db/virtualcard-backup.db

# Back up uploaded WebP avatars
docker run --rm -v virtualcard_virtualcard_uploads:/src -v $(pwd)/backups:/dst node:22-bookworm-slim \
  tar -czf /dst/uploads-$(date +%F).tar.gz -C /src .
```

### Continuous Streaming Backup (Litestream Option)
For continuous point-in-time replication to S3-compatible storage, run a `litestream` sidecar sharing the `virtualcard_db` volume (WAL mode is already enabled by `src/db/index.ts`).

---

## AJAX API Contract & Rate Limiting

### Response Format
All JSON endpoints (`Accept: application/json` or `/api/*`) follow a unified envelope:
- **Success**:
  ```json
  { "ok": true, "data": { ... } }
  ```
- **Error**:
  ```json
  { "error": { "code": "USERNAME_TAKEN", "message": "That username is taken.", "field": "username" } }
  ```

### `GET /api/username-available?u=<name>`
Validates `<name>` against `^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$`, checks the reserved list (`www`, `api`, `app`, `admin`, `master`, `root`, etc.), and queries case-insensitive availability.
- **200**: `{ "ok": true, "data": { "available": true, "username": "mahbubkhan" } }`
- **200 (unavailable)**: `{ "ok": true, "data": { "available": false, "username": "admin", "reason": "This username is reserved..." } }`
- **400**: `{ "error": { "code": "VALIDATION_ERROR", "message": "...", "field": "u" } }`
- **429**: `{ "error": { "code": "USERNAME_CHECK_RATE_LIMIT", "message": "..." } }`

### Rate Limits & Scaling Tradeoff
`express-rate-limit` enforces per-IP limits (`src/middleware/rateLimit.ts`):
- `POST /signup`: **5 requests / minute** (`SIGNUP_RATE_LIMIT`)
- `POST /login`: **5 requests / minute** (`LOGIN_RATE_LIMIT`)
- `GET /api/username-available`: **30 requests / minute** (`USERNAME_CHECK_RATE_LIMIT`)
- `GET /qr.png`, `GET /qr.svg`: **30 requests / minute** (`QR_RATE_LIMIT`)

*Tradeoff*: These limiters default to an in-memory store, suitable for a single-node SQLite container deployment. To scale horizontally across multiple replicas, configure a shared backing store (e.g., Redis) alongside shared database storage.

---

## Liquid Glass Design System

- **Surface Palette**: Obsidian Aurora canvas (`#06070a` base, animated radial gradient blobs) with refractive translucent glass (`rgba(24, 26, 36, 0.56)`, `backdrop-filter: blur(22px) saturate(180%)`), inner top specular highlight (`inset 0 1px 0 rgba(255, 255, 255, 0.3)`), and customizable accent tints (`#38bdf8`, `#a855f7`, `#10b981`, `#f43f5e`, `#f59e0b`, `#6366f1`).
- **Typography**: Self-hosted `@fontsource/inter` WOFF2 fonts served locally from `/fonts/` with `font-display: swap`.
- **QR Contrast Invariant**: Scannable QR codes are always rendered inside a pure opaque white `.solid-qr-card` frame (`#ffffff`) rather than translucent glass to preserve scan reliability across cameras.
- **Accessibility & Fallbacks** (`public/css/glass.css`):
  - `@supports not (backdrop-filter: blur(1px))`: solid high-contrast dark panels.
  - `@media (prefers-reduced-transparency: reduce)`: removes blur and increases surface opacity to `0.97`.
  - `@media (prefers-reduced-motion: reduce)`: disables aurora drift, entrance animations, and avatar ripple transitions.
  - `@media (forced-colors: active)`: maps surfaces and primary buttons to OS system `Canvas` / `Highlight` tokens.

---

## NPM Scripts & Verification

```bash
npm run dev         # Start local dev server with tsx watch
npm run build       # Compile TypeScript and copy EJS views to dist/
npm start           # Run compiled production server (dist/server.js)
npm run migrate     # Apply committed Drizzle migrations (drizzle/)
npm run seed        # Idempotently create/update Master admin user from .env
npm run lint        # Run ESLint across src and tests
npm run typecheck   # Run tsc --noEmit
npm test            # Run Vitest unit & Supertest integration suite
npm run test:e2e    # Run Playwright Chromium E2E smoke test suite
```
