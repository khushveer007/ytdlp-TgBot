#!/bin/bash
set -e

# Colors for terminal output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Banner
echo -e "${GREEN}"
echo "=================================="
echo "  YT-DLP Telegram Bot Deployment  "
echo "=================================="
echo -e "${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run this script as root or with sudo${NC}"
  exit 1
fi

# Function to display progress
progress() {
  echo -e "${GREEN}➡️ $1${NC}"
}

# Function to display warnings
warning() {
  echo -e "${YELLOW}⚠️ $1${NC}"
}

# Function to display errors
error() {
  echo -e "${RED}❌ $1${NC}"
}

# Ask for bot token
echo -e "${YELLOW}Please enter your Telegram Bot Token:${NC}"
read -r bot_token

# Validate token is not empty
while [ -z "$bot_token" ]; do
  error "Bot token cannot be empty"
  echo -e "${YELLOW}Please enter your Telegram Bot Token:${NC}"
  read -r bot_token
done

echo ""
progress "Beginning installation process..."

# Update system and install dependencies
progress "Updating system packages..."
apt update

progress "Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_16.x | bash -
apt install -y nodejs gcc g++ make

progress "Installing yt-dlp..."
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod a+rx /usr/local/bin/yt-dlp

progress "Installing ffmpeg..."
apt install -y ffmpeg

# Create bot directory
BOT_DIR="/opt/ytdlp-bot"
progress "Creating bot directory at $BOT_DIR..."
mkdir -p "$BOT_DIR"

# Copy all files from current directory to bot directory
current_dir=$(pwd)
if [ "$current_dir" != "$BOT_DIR" ]; then
  progress "Copying bot files to $BOT_DIR..."
  cp -R * "$BOT_DIR/" 2>/dev/null || true
fi

# Go to bot directory
cd "$BOT_DIR"

# Create .env file
progress "Creating environment configuration..."
cat > "$BOT_DIR/.env" <<EOF
TELEGRAM_BOT_TOKEN=$bot_token
PORT=3000
USE_WEBHOOK=false
SERVER_URL=
AUTO_SETUP_WEBHOOK=false
NODE_ENV=production
EOF

# Install node dependencies
progress "Installing Node.js dependencies..."
npm install --production

# Create systemd service
progress "Setting up systemd service..."
cat > /etc/systemd/system/ytdlp-bot.service <<EOF
[Unit]
Description=YT-DLP Telegram Bot
After=network.target

[Service]
ExecStart=/usr/bin/node $BOT_DIR/index.js
Restart=always
User=root
Group=root
Environment=PATH=/usr/bin:/usr/local/bin
WorkingDirectory=$BOT_DIR

[Install]
WantedBy=multi-user.target
EOF

# Enable and start the service
progress "Starting bot service..."
systemctl daemon-reload
systemctl enable ytdlp-bot
systemctl start ytdlp-bot

# Check service status with retry
service_running=false
for i in {1..5}; do
  if systemctl is-active --quiet ytdlp-bot; then
    service_running=true
    break
  else
    echo "Waiting for service to start (attempt $i/5)..."
    sleep 2
  fi
done

if $service_running; then
  progress "Bot service is running!"
else
  error "Failed to start bot service. Check logs with: journalctl -u ytdlp-bot -e"
  exit 1
fi

# Final instructions
echo -e "${GREEN}"
echo "======================================"
echo "  YT-DLP Telegram Bot Setup Complete  "
echo "======================================"
echo -e "${NC}"

echo "Your bot is now running in polling mode!"
echo ""
IP_ADDRESS=$(curl -s ifconfig.me)
echo "You can access the bot's web interface at: http://$IP_ADDRESS:3000"
echo ""
echo "Useful commands:"
echo "- Check service status: systemctl status ytdlp-bot"
echo "- View logs: journalctl -u ytdlp-bot -f"
echo "- Restart the bot: systemctl restart ytdlp-bot"
echo ""
echo "Enjoy your bot!"
