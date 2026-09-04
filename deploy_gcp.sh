#!/bin/bash
# ==============================================================================
# CDC Action Zone Binance Trading Bot - Google Cloud VM Setup & Deploy Script
# Compatible with Ubuntu 22.04 / 24.04 LTS or Debian 11 / 12 on Google Cloud
# ==============================================================================
set -e

echo "=========================================="
echo "🚀 Starting CDC Binance Bot GCP Setup..."
echo "=========================================="

# 1. Update system packages
echo "📦 Updating apt repository..."
sudo apt-get update -y

# 2. Install Node.js 20 LTS & Build Tools
if ! command -v node &> /dev/null; then
  echo "📥 Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs git build-essential
else
  echo "✅ Node.js is already installed ($(node -v))"
fi

# 3. Install PM2 (Process Manager for 24/7 background running)
if ! command -v pm2 &> /dev/null; then
  echo "⚙️ Installing PM2 globally..."
  sudo npm install -g pm2
else
  echo "✅ PM2 is already installed"
fi

# 4. Check for .env file
if [ ! -f .env ]; then
  echo "⚠️ Warning: .env file not found!"
  if [ -f .env.example ]; then
    echo "📋 Copying .env.example to .env..."
    cp .env.example .env
    echo "❗ Please edit .env with your Binance API keys and Telegram credentials (nano .env)"
  fi
fi

# 5. Install dependencies and build production bundle
echo "🔨 Installing npm dependencies..."
npm install

echo "⚡ Building production bundle..."
npm run build

# 6. Ensure data directory exists
mkdir -p data

# 7. Start or restart with PM2
echo "🔄 Starting application with PM2 (24/7 background)..."
pm2 delete cdc-bot 2>/dev/null || true
NODE_ENV=production pm2 start dist/server.cjs --name "cdc-bot"
pm2 save

echo "=========================================="
echo "🎉 Deployment successful!"
echo "• View live logs:    pm2 logs cdc-bot"
echo "• View bot status:   pm2 status"
echo "• Restart bot:       pm2 restart cdc-bot"
echo "• Stop bot:          pm2 stop cdc-bot"
echo "=========================================="
