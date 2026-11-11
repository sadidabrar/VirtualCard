#!/usr/bin/env bash
# ==============================================================================
# VirtualCard — Fresh Debian / Ubuntu Container (LXC / VPS) Native Installer
# Sets up: Node.js 22 LTS, build tools, Custom Caddy (DuckDNS DNS-01 TLS),
#          Git clone + build + Drizzle SQLite migrate & seed + systemd services.
# Usage:
#   REPO_URL="https://github.com/<you>/VirtualCard.git" bash install-ubuntu-debian.sh
#   OR simply run interactively and follow the prompts.
# ==============================================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${CYAN}[virtualcard]${NC} $*"; }
ok()   { echo -e "${GREEN}[   ok     ]${NC} $*"; }
warn() { echo -e "${YELLOW}[  warn    ]${NC} $*"; }
fail() { echo -e "${RED}[  error   ]${NC} $*" >&2; exit 1; }

# 1. Pre-flight OS & Privilege Checks
if [[ "$(id -u)" -ne 0 ]]; then
  fail "Please run this script as root (e.g., sudo bash $0)."
fi

if [[ ! -r /etc/os-release ]]; then
  fail "Cannot detect OS (/etc/os-release missing). Debian or Ubuntu is required."
fi
# shellcheck source=/dev/null
source /etc/os-release
if [[ "${ID:-}" != "debian" && "${ID:-}" != "ubuntu" ]]; then
  fail "Unsupported OS '${ID:-unknown}'. This installer targets Debian and Ubuntu."
fi
ok "Detected ${PRETTY_NAME:-$ID}"

# 2. Gather Configuration (supports env overrides or interactive /dev/tty prompts)
prompt_var() {
  local var_name="$1"
  local prompt_text="$2"
  local default_val="${3:-}"
  local is_secret="${4:-false}"
  local current_val="${!var_name:-}"

  if [[ -n "$current_val" ]]; then
    return 0
  fi

  if [[ ! -e /dev/tty ]]; then
    if [[ -n "$default_val" ]]; then
      printf -v "$var_name" '%s' "$default_val"
      return 0
    fi
    fail "Missing required environment variable ${var_name} in non-interactive mode."
  fi

  local input=""
  if [[ "$is_secret" == "true" ]]; then
    if [[ -n "$default_val" ]]; then
      echo -en "${CYAN}?${NC} ${prompt_text} [leave blank to auto-generate]: " > /dev/tty
    else
      echo -en "${CYAN}?${NC} ${prompt_text}: " > /dev/tty
    fi
    read -rs input < /dev/tty
    echo "" > /dev/tty
  else
    if [[ -n "$default_val" ]]; then
      echo -en "${CYAN}?${NC} ${prompt_text} [${default_val}]: " > /dev/tty
    else
      echo -en "${CYAN}?${NC} ${prompt_text}: " > /dev/tty
    fi
    read -r input < /dev/tty
  fi

  input="${input:-$default_val}"
  printf -v "$var_name" '%s' "$input"
}

REPO_URL="${REPO_URL:-}"
while [[ -z "${REPO_URL}" ]]; do
  prompt_var REPO_URL "Git repository URL for VirtualCard (e.g. https://github.com/user/VirtualCard.git)"
done

BRANCH="${BRANCH:-master}"
APP_DIR="${APP_DIR:-/opt/virtualcard}"
APP_USER="${APP_USER:-virtualcard}"

prompt_var BASE_DOMAIN "Base domain" "virtualcard.duckdns.org"
BASE_DOMAIN="$(echo "$BASE_DOMAIN" | tr '[:upper:]' '[:lower:]' | xargs)"

prompt_var MASTER_USERNAME "Master admin username" "master"
MASTER_USERNAME="$(echo "$MASTER_USERNAME" | tr '[:upper:]' '[:lower:]' | xargs)"
if [[ ! "$MASTER_USERNAME" =~ ^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$ ]]; then
  fail "MASTER_USERNAME must be 3-30 lowercase alphanumeric/hyphen characters."
fi

prompt_var MASTER_EMAIL "Master admin email (also used for Let's Encrypt ACME)" "admin@${BASE_DOMAIN}"
MASTER_EMAIL="$(echo "$MASTER_EMAIL" | tr '[:upper:]' '[:lower:]' | xargs)"

MASTER_PASSWORD="${MASTER_PASSWORD:-}"
GENERATED_PASS=""
if [[ -z "$MASTER_PASSWORD" ]]; then
  prompt_var MASTER_PASSWORD "Master admin password (min 12 chars)" "AUTO_GENERATE" "true"
  if [[ "$MASTER_PASSWORD" == "AUTO_GENERATE" || -z "$MASTER_PASSWORD" ]]; then
    MASTER_PASSWORD="$(tr -dc 'A-Za-z0-9!@%_-' < /dev/urandom | head -c 20 || true)"
    GENERATED_PASS="$MASTER_PASSWORD"
  fi
fi
if [[ ${#MASTER_PASSWORD} -lt 12 ]]; then
  fail "MASTER_PASSWORD must be at least 12 characters in production."
fi

prompt_var DUCKDNS_TOKEN "DuckDNS API token (needed for wildcard TLS DNS-01)"
if [[ -z "$DUCKDNS_TOKEN" ]]; then
  warn "DUCKDNS_TOKEN is empty — Caddy TLS wildcard issuance will fail until added to /etc/caddy/caddy.env."
fi

PORT="${PORT:-3000}"

# Port conflict warning (if something outside virtualcard/caddy owns 80/443/3000)
if command -v ss >/dev/null 2>&1; then
  for check_port in 80 443 "$PORT"; do
    if ss -tulpn 2>/dev/null | grep -qE ":${check_port}\b"; then
      if ! systemctl is-active --quiet virtualcard && ! systemctl is-active --quiet caddy; then
        warn "Port ${check_port} appears to already be in use on this container."
      fi
    fi
  done
fi

# 3. Install Base System Packages
log "Installing base OS packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  gnupg \
  git \
  sqlite3 \
  python3 \
  make \
  g++ \
  openssl \
  iproute2
ok "Base OS packages installed."

# 4. Install Node.js 22 LTS (NodeSource)
NEED_NODE=true
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
  if [[ "$NODE_MAJOR" == "22" ]]; then
    NEED_NODE=false
    ok "Node.js $(node -v) already installed."
  fi
fi

if [[ "$NEED_NODE" == "true" ]]; then
  log "Installing Node.js 22 LTS..."
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update -y
  apt-get install -y nodejs
  ok "Installed Node.js $(node -v) and npm $(npm -v)."
fi

# 5. Install Custom Caddy Binary with DuckDNS DNS-01 Plugin (No Docker)
ARCH="$(dpkg --print-architecture)"
case "$ARCH" in
  amd64|arm64) ;;
  *) fail "Unsupported architecture '${ARCH}' for prebuilt Caddy download." ;;
esac

NEED_CADDY=true
if [[ -x /usr/local/bin/caddy ]]; then
  if /usr/local/bin/caddy list-modules 2>/dev/null | grep -q '^dns\.providers\.duckdns$'; then
    NEED_CADDY=false
    ok "Custom Caddy with dns.providers.duckdns already installed."
  fi
fi

if [[ "$NEED_CADDY" == "true" ]]; then
  log "Downloading official custom Caddy binary with github.com/caddy-dns/duckdns (${ARCH})..."
  TMP_CADDY="/tmp/caddy.custom.$$"
  if curl -fsSL --retry 3 "https://caddyserver.com/api/download?os=linux&arch=${ARCH}&p=github.com/caddy-dns/duckdns" -o "$TMP_CADDY" && chmod 0755 "$TMP_CADDY" && "$TMP_CADDY" list-modules 2>/dev/null | grep -q '^dns\.providers\.duckdns$'; then
    mv "$TMP_CADDY" /usr/local/bin/caddy
    ok "Installed /usr/local/bin/caddy with DuckDNS DNS-01 plugin."
  else
    rm -f "$TMP_CADDY"
    warn "Caddy download API failed; falling back to building with Go + xcaddy..."
    apt-get install -y golang-go
    export GOPATH="/tmp/gopath.$$"
    export PATH="${GOPATH}/bin:${PATH}"
    go install github.com/caddyserver/xcaddy/cmd/xcaddy@latest
    "${GOPATH}/bin/xcaddy" build --with github.com/caddy-dns/duckdns --output /usr/local/bin/caddy
    chmod 0755 /usr/local/bin/caddy
    rm -rf "$GOPATH"
    ok "Built /usr/local/bin/caddy via xcaddy."
  fi
fi

if ! id -u caddy >/dev/null 2>&1; then
  groupadd --system caddy || true
  useradd --system --gid caddy --create-home --home-dir /var/lib/caddy --shell /usr/sbin/nologin caddy
fi
mkdir -p /etc/caddy /var/lib/caddy
chown -R caddy:caddy /var/lib/caddy

# 6. Create Service User & Clone / Update Repository
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd --system --no-create-home --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi

if [[ -d "${APP_DIR}/.git" ]]; then
  log "Updating existing repository in ${APP_DIR}..."
  chown -R "${APP_USER}:${APP_USER}" "$APP_DIR"
  runuser -u "$APP_USER" -- env HOME="$APP_DIR" git -C "$APP_DIR" remote set-url origin "$REPO_URL"
  runuser -u "$APP_USER" -- env HOME="$APP_DIR" git -C "$APP_DIR" fetch --all --prune
  runuser -u "$APP_USER" -- env HOME="$APP_DIR" git -C "$APP_DIR" checkout "$BRANCH"
  runuser -u "$APP_USER" -- env HOME="$APP_DIR" git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
else
  log "Cloning ${REPO_URL} (branch ${BRANCH}) into ${APP_DIR}..."
  if [[ -d "$APP_DIR" ]] && [[ -n "$(ls -A "$APP_DIR" 2>/dev/null)" ]]; then
    rm -rf "${APP_DIR:?}/"* "${APP_DIR:?}/".[!.]* 2>/dev/null || true
  fi
  mkdir -p "$APP_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

mkdir -p "${APP_DIR}/data/db" "${APP_DIR}/data/uploads"
chown -R "${APP_USER}:${APP_USER}" "$APP_DIR"

# 7. Write Production .env (Preserve SESSION_SECRET on Re-runs)
ENV_FILE="${APP_DIR}/.env"
EXISTING_SESSION_SECRET=""
if [[ -f "$ENV_FILE" ]]; then
  EXISTING_SESSION_SECRET="$(grep -E '^SESSION_SECRET=' "$ENV_FILE" | head -n1 | cut -d= -f2- || true)"
fi
SESSION_SECRET="${EXISTING_SESSION_SECRET:-$(openssl rand -hex 32)}"

# Quote MASTER_PASSWORD cleanly so dotenv and systemd agree even if it contains '#' or spaces
if [[ "$MASTER_PASSWORD" != *"'"* ]]; then
  ENV_MASTER_PASSWORD="'${MASTER_PASSWORD}'"
elif [[ "$MASTER_PASSWORD" != *'"'* ]]; then
  ENV_MASTER_PASSWORD="\"${MASTER_PASSWORD}\""
else
  ENV_MASTER_PASSWORD="${MASTER_PASSWORD}"
fi

cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=${PORT}
BASE_DOMAIN=${BASE_DOMAIN}
DATABASE_URL=${APP_DIR}/data/db/virtualcard.db
UPLOAD_DIR=${APP_DIR}/data/uploads
SESSION_SECRET=${SESSION_SECRET}
MASTER_EMAIL=${MASTER_EMAIL}
MASTER_USERNAME=${MASTER_USERNAME}
MASTER_PASSWORD=${ENV_MASTER_PASSWORD}
LOG_LEVEL=info
DUCKDNS_TOKEN=${DUCKDNS_TOKEN}
EOF
chown "${APP_USER}:${APP_USER}" "$ENV_FILE"
chmod 0600 "$ENV_FILE"

# Separate minimal env file for Caddy so Caddy cannot read app secrets
cat > /etc/caddy/caddy.env <<EOF
BASE_DOMAIN=${BASE_DOMAIN}
ACME_EMAIL=${MASTER_EMAIL}
DUCKDNS_TOKEN=${DUCKDNS_TOKEN}
EOF
chown root:caddy /etc/caddy/caddy.env
chmod 0640 /etc/caddy/caddy.env

# 8. Install Dependencies, Compile TypeScript, Migrate & Seed SQLite
log "Installing npm dependencies, building dist/, and pruning devDependencies..."
runuser -u "$APP_USER" -- env HOME="$APP_DIR" npm_config_cache="${APP_DIR}/.npm" bash -c "cd '${APP_DIR}' && npm ci && npm run build && npm prune --omit=dev && rm -rf '${APP_DIR}/.npm'"

log "Running Drizzle migrations and seeding master admin..."
runuser -u "$APP_USER" -- env HOME="$APP_DIR" bash -c "cd '${APP_DIR}' && node dist/db/migrate.js && node dist/db/seed.js"
ok "Database migrated and master admin seeded."

# 9. Configure Caddyfile & Systemd Services (LXC-safe, No Container Mount Namespaces)
log "Writing /etc/caddy/Caddyfile and systemd unit files..."
cat > /etc/caddy/Caddyfile <<EOF
{
  email {\$ACME_EMAIL:${MASTER_EMAIL}}
}

{\$BASE_DOMAIN:${BASE_DOMAIN}}, *.{\$BASE_DOMAIN:${BASE_DOMAIN}} {
  tls {
    dns duckdns {\$DUCKDNS_TOKEN}
  }

  encode zstd gzip

  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Frame-Options "SAMEORIGIN"
    -Server
  }

  reverse_proxy 127.0.0.1:${PORT} {
    header_up Host {host}
    header_up X-Forwarded-Host {host}
    header_up X-Real-IP {remote_host}
    health_uri /healthz
    health_interval 30s
    health_timeout 5s
  }
}
EOF
chown root:caddy /etc/caddy/Caddyfile
chmod 0644 /etc/caddy/Caddyfile

NODE_BIN="$(command -v node)"
cat > /etc/systemd/system/virtualcard.service <<EOF
[Unit]
Description=VirtualCard Multi-Tenant Liquid Glass Server
After=network.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=${NODE_BIN} ${APP_DIR}/dist/server.js
Restart=on-failure
RestartSec=3
TimeoutStopSec=15
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/caddy.service <<EOF
[Unit]
Description=Caddy Reverse Proxy (DuckDNS Wildcard DNS-01 TLS)
After=network-online.target virtualcard.service
Wants=network-online.target

[Service]
Type=notify
User=caddy
Group=caddy
EnvironmentFile=/etc/caddy/caddy.env
ExecStart=/usr/local/bin/caddy run --environ --config /etc/caddy/Caddyfile
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy/Caddyfile --force
TimeoutStopSec=5s
LimitNOFILE=1048576
AmbientCapabilities=CAP_NET_BIND_SERVICE
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable virtualcard
systemctl restart virtualcard

if [[ -n "$DUCKDNS_TOKEN" ]]; then
  systemctl enable caddy
  systemctl restart caddy
else
  warn "DUCKDNS_TOKEN is empty — Caddy was configured but not started."
  warn "Add DUCKDNS_TOKEN to /etc/caddy/caddy.env, then run: systemctl enable --now caddy"
fi

# 10. Post-Install Readiness Verification
log "Waiting for http://127.0.0.1:${PORT}/readyz..."
READY_OK=false
for _ in $(seq 1 15); do
  if curl -fsS "http://127.0.0.1:${PORT}/readyz" >/dev/null 2>&1; then
    READY_OK=true
    break
  fi
  sleep 1
done

if [[ "$READY_OK" != "true" ]]; then
  journalctl -u virtualcard -n 40 --no-pager || true
  fail "VirtualCard failed readiness check on port ${PORT}."
fi

echo ""
ok "VirtualCard installation completed successfully!"
echo "======================================================================"
echo "  Public URL:       https://${BASE_DOMAIN}"
echo "  Subdomain URL:    https://<username>.${BASE_DOMAIN}"
echo "  Master Panel:     https://${BASE_DOMAIN}/master"
echo "  Master Username:  ${MASTER_USERNAME}"
if [[ -n "$GENERATED_PASS" ]]; then
  echo "  Master Password:  ${GENERATED_PASS}  (save this now!)"
else
  echo "  Master Password:  (the password you provided)"
fi
echo "  App Directory:    ${APP_DIR}"
echo "  SQLite Database:  ${APP_DIR}/data/db/virtualcard.db"
echo "  Service Status:   systemctl status virtualcard caddy"
echo "  Live Logs:        journalctl -u virtualcard -u caddy -f"
echo "======================================================================"
