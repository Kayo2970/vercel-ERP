#!/usr/bin/env bash
#
# vps-setup.sh — one-shot bootstrap for the LEADS Dashboard on a fresh
# Ubuntu VPS, run as root, installed to /ERP.
#
# What it does: installs Node.js 22, PM2, Nginx, Certbot and git; clones (or
# updates) the app into /ERP; installs dependencies; generates a fresh
# DATA_ENCRYPTION_KEY the first time it's ever run; builds the app; starts
# it under PM2 with auto-restart on reboot; writes an Nginx reverse-proxy
# config for DOMAIN; opens the firewall for SSH + HTTP/HTTPS; and requests
# a Let's Encrypt certificate if CERTBOT_EMAIL is set.
#
# Safe to re-run: it skips anything already installed/present rather than
# re-doing it, and it never overwrites an existing .env (so it can never
# regenerate — and thereby invalidate — a DATA_ENCRYPTION_KEY that's
# already protecting real data).
#
# Usage:
#   1. Edit DOMAIN (and CERTBOT_EMAIL, optional) below.
#   2. As root: bash vps-setup.sh
#
set -euo pipefail

# ── Configure these two before running ──────────────────────────────────
DOMAIN="leadsnextgencentre.online"
CERTBOT_EMAIL=""   # e.g. "you@example.com" — leave blank to skip HTTPS setup
                    # and run it manually later (see the bottom of this file)
# ──────────────────────────────────────────────────────────────────────────

REPO_URL="https://github.com/Kayo2970/ERP.git"
INSTALL_DIR="/ERP"
APP_DIR="$INSTALL_DIR/leads-dashboard"

if [ "$(id -u)" -ne 0 ]; then
  echo "This script must be run as root (e.g. 'sudo bash vps-setup.sh' or already logged in as root)." >&2
  exit 1
fi

log() { echo -e "\n\033[1;36m==> $1\033[0m"; }

log "Updating system packages"
apt update -y && apt upgrade -y

log "Installing Node.js 22 LTS"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt install -y nodejs
else
  echo "Node.js already installed: $(node -v)"
fi

log "Installing PM2, Nginx, Certbot, git"
command -v pm2 >/dev/null 2>&1 || npm install -g pm2
apt install -y nginx git certbot python3-certbot-nginx ufw

log "Cloning or updating the repository at $INSTALL_DIR"
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "$INSTALL_DIR already exists — pulling latest instead of cloning."
  git -C "$INSTALL_DIR" pull
else
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$APP_DIR"

log "Installing app dependencies (npm install)"
npm install

log "Configuring environment (.env)"
if [ -f .env ]; then
  echo ".env already exists — leaving it untouched (this is what keeps your DATA_ENCRYPTION_KEY stable across re-runs)."
else
  cp .env.example .env
  GENERATED_KEY="$(openssl rand -hex 32)"
  # .env.example ships without DATA_ENCRYPTION_KEY — add it fresh.
  echo "" >> .env
  echo "DATA_ENCRYPTION_KEY=$GENERATED_KEY" >> .env
  echo "Generated a new DATA_ENCRYPTION_KEY and wrote it to .env."
fi

log "Setting up the Super User account"
# No-op if data/members.json already has accounts in it (e.g. a redeploy of
# an existing instance) — only prompts on a genuinely fresh install.
node scripts/setup-superuser.js

log "Building the app for production"
npm run build

log "Starting the app under PM2"
cat > "$APP_DIR/ecosystem.config.js" <<EOF
module.exports = {
  apps: [
    {
      name: 'leads-dashboard',
      cwd: '$APP_DIR',
      script: 'npm',
      args: 'start -- -p 3000',
      env: { NODE_ENV: 'production' },
    },
  ],
};
EOF

if pm2 describe leads-dashboard >/dev/null 2>&1; then
  pm2 reload leads-dashboard
else
  pm2 start ecosystem.config.js
fi
pm2 save
pm2 startup systemd -u root --hp /root >/tmp/pm2-startup-output.txt 2>&1 || true
# pm2 startup prints a command it wants run once; running as root, it's
# usually applied automatically, but check /tmp/pm2-startup-output.txt if
# the app doesn't come back after a reboot.

log "Writing Nginx config for $DOMAIN"
cat > "/etc/nginx/sites-available/leads-dashboard" <<EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    client_max_body_size 100M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
ln -sf /etc/nginx/sites-available/leads-dashboard /etc/nginx/sites-enabled/leads-dashboard
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
systemctl enable nginx

log "Configuring the firewall"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

if [ -n "$CERTBOT_EMAIL" ]; then
  log "Requesting a Let's Encrypt certificate for $DOMAIN"
  certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" -m "$CERTBOT_EMAIL" --agree-tos --non-interactive --redirect
else
  echo -e "\nCERTBOT_EMAIL not set — skipping HTTPS setup. Run this manually once DNS is confirmed pointing here:"
  echo "  certbot --nginx -d $DOMAIN -d www.$DOMAIN"
fi

echo -e "\n\033[1;32m==================================================================\033[0m"
echo -e "\033[1;32mDone. The app is running under PM2 and Nginx is proxying to it.\033[0m"
echo "  App directory:   $APP_DIR"
echo "  Check status:    pm2 status"
echo "  View logs:       pm2 logs leads-dashboard"
if [ -f .env ] && grep -q "^DATA_ENCRYPTION_KEY=" .env; then
  echo ""
  echo -e "\033[1;33mSAVE THIS SOMEWHERE OTHER THAN THIS SERVER — it's the only way to decrypt your data if this disk is ever lost:\033[0m"
  grep "^DATA_ENCRYPTION_KEY=" .env
fi
echo -e "\033[1;32m==================================================================\033[0m"
