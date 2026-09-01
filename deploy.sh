#!/usr/bin/env bash
set -e

echo "🚀 Starting LEADS ERP VPS Deployment..."

# Locate script directory & leads-dashboard folder
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -d "$SCRIPT_DIR/leads-dashboard" ]; then
  cd "$SCRIPT_DIR/leads-dashboard"
elif [ -f "$SCRIPT_DIR/package.json" ]; then
  cd "$SCRIPT_DIR"
else
  echo "❌ Error: Could not find leads-dashboard directory."
  exit 1
fi

echo "📥 1. Pulling latest commits from origin/main..."
git pull origin main

echo "📦 2. Installing dependencies..."
npm install

echo "🛠️ 3. Building Next.js production bundle..."
npm run build

echo "🔄 4. Restarting PM2 process 'leads-dashboard'..."
if command -v pm2 &> /dev/null; then
  pm2 restart leads-dashboard || pm2 start npm --name "leads-dashboard" -- start
else
  echo "⚠️ PM2 not found in PATH."
fi

echo "✨ Deployment completed successfully!"
