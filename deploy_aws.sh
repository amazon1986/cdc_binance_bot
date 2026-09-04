#!/bin/bash
# ==============================================================================
# CDC Action Zone Binance Trading Bot - AWS EC2 & Lightsail Deploy Script
# Supports Ubuntu 22.04/24.04 LTS, Debian 11/12, and Amazon Linux 2023
# ==============================================================================
set -e

echo "=========================================="
echo "🚀 Starting CDC Binance Bot AWS Setup..."
echo "=========================================="

# 1. Detect OS & Install Node.js 20 LTS + Build Tools
if command -v apt-get &> /dev/null; then
  echo "📦 Detected Debian/Ubuntu system. Updating packages..."
  sudo apt-get update -y
  if ! command -v node &> /dev/null; then
    echo "📥 Installing Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs git build-essential
  else
    echo "✅ Node.js is already installed ($(node -v))"
  fi
elif command -v dnf &> /dev/null; then
  echo "📦 Detected Amazon Linux 2023 / RHEL. Updating packages..."
  sudo dnf update -y
  if ! command -v node &> /dev/null; then
    echo "📥 Installing Node.js 20 LTS..."
    sudo dnf install -y nodejs git make gcc-c++
  else
    echo "✅ Node.js is already installed ($(node -v))"
  fi
else
  echo "⚠️ Unknown package manager, please ensure Node.js 20+ is installed manually."
fi

# 2. Install PM2 (Process Manager for 24/7 background running)
if ! command -v pm2 &> /dev/null; then
  echo "⚙️ Installing PM2 globally..."
  sudo npm install -g pm2
else
  echo "✅ PM2 is already installed ($(pm2 -v))"
fi

# 3. Check for .env configuration file
if [ ! -f .env ]; then
  echo "⚠️ Warning: .env file not found!"
  if [ -f .env.example ]; then
    echo "📋 Copying .env.example to .env..."
    cp .env.example .env
    echo "❗ Please configure your Binance API keys and Telegram credentials in .env (nano .env)"
  fi
fi

# 4. Install dependencies and build production bundle
echo "🔨 Installing npm dependencies..."
npm install

echo "⚡ Building production bundle..."
npm run build

# 5. Ensure data persistence directory exists
mkdir -p data

# 6. Start or restart with PM2
echo "🔄 Starting application with PM2 (24/7 background)..."
pm2 delete cdc-bot 2>/dev/null || true
NODE_ENV=production pm2 start dist/server.cjs --name "cdc-bot"
pm2 save

# Setup PM2 startup on system reboot if not configured
pm2 startup 2>/dev/null || true

echo "=========================================="
echo "🎉 AWS Deployment successful!"
echo "• View live logs:    pm2 logs cdc-bot"
echo "• View bot status:   pm2 status"
echo "• Restart bot:       pm2 restart cdc-bot"
echo "• Stop bot:          pm2 stop cdc-bot"
echo "• Open Security Group / Firewall Port: 3000 (TCP)"
echo "=========================================="
