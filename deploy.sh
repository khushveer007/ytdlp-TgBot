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
  echo -e "${RED}Please run as root or with sudo${NC}"
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

# Function to get user input with default value
prompt() {
  local prompt_msg="$1"
  local default_val="$2"
  local options="$3"  # Optional parameter for available options
  local user_input
  
  echo -e "${YELLOW}$prompt_msg${NC}"
  echo -e "${GREEN}How to respond:${NC}"
  echo -e " - Press ${GREEN}Enter${NC} to accept default value [${default_val}]"
  echo -e " - Type your answer and press ${GREEN}Enter${NC} to set a custom value"
  
  if [ -n "$options" ]; then
    # Display available options to guide the user
    echo -e "${YELLOW}Available options: $options${NC}"
  fi
  
  if [ -n "$default_val" ]; then
    echo -n -e "${YELLOW}Your choice [${default_val}]: ${NC}"
  else
    echo -n -e "${YELLOW}Your input (required): ${NC}"
  fi
  
  read user_input
  
  if [ -z "$user_input" ] && [ -n "$default_val" ]; then
    echo "$default_val"
  else
    echo "$user_input"
  fi
}

# Ask for confirmation to run the script
echo -e "${YELLOW}This script will deploy the YT-DLP Telegram Bot.${NC}"
echo "It will install required packages, set up system services, and configure the bot."
echo ""
run_script=$(prompt "Do you want to run this script? (y/n)" "y")

if [ "$run_script" != "y" ] && [ "$run_script" != "Y" ]; then
  echo -e "${RED}Script execution cancelled by user.${NC}"
  exit 0
fi

echo ""
echo -e "${YELLOW}Starting deployment process...${NC}"
echo ""

# Collect all configuration values up front
progress "Collecting necessary information..."
echo ""

bot_token=$(prompt "Enter your Telegram Bot Token" "")

while [ -z "$bot_token" ]; do
  error "Bot token cannot be empty"
  bot_token=$(prompt "Enter your Telegram Bot Token" "")
done

use_domain=$(prompt "Do you want to set up a domain name? (y/n)" "n")
domain=""

if [ "$use_domain" = "y" ] || [ "$use_domain" = "Y" ]; then
  domain=$(prompt "Enter your domain name (e.g., bot.example.com)" "")
  
  while [ -z "$domain" ]; do
    error "Domain name cannot be empty"
    domain=$(prompt "Enter your domain name (e.g., bot.example.com)" "")
  done
  
  use_webhook="true"
  server_url="https://$domain"
else
  use_webhook="false"
  server_url=""
  warning "Running without a domain name. The bot will use polling mode."
fi

# Ask for confirmation before proceeding
echo ""
echo -e "${YELLOW}Configuration Summary:${NC}"
echo "Telegram Bot Token: [hidden for security]"
echo "Use Domain: $use_domain"
if [ "$use_domain" = "y" ] || [ "$use_domain" = "Y" ]; then
  echo "Domain: $domain"
  echo "Webhook Mode: Enabled"
else
  echo "Webhook Mode: Disabled (using polling)"
fi

echo ""
proceed=$(prompt "Do you want to proceed with the installation? (y/n)" "y")

if [ "$proceed" != "y" ] && [ "$proceed" != "Y" ]; then
  error "Installation aborted by user"
  exit 1
fi

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

# Check if we need to install Nginx
if [ "$use_webhook" = "true" ]; then
  progress "Installing Nginx and Certbot..."
  apt install -y nginx certbot python3-certbot-nginx
  
  # Configure Nginx
  progress "Configuring Nginx..."
  
  # Create Nginx config file
  cat > /etc/nginx/sites-available/ytdlp-bot <<EOF
server {
    listen 80;
    server_name $domain;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
  
  # Enable the Nginx site
  ln -sf /etc/nginx/sites-available/ytdlp-bot /etc/nginx/sites-enabled/
  nginx -t && systemctl restart nginx
  
  # Set up SSL with Let's Encrypt
  progress "Setting up SSL with Let's Encrypt..."
  certbot --nginx -d "$domain" --non-interactive --agree-tos --email admin@"$domain" --redirect
fi

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
USE_WEBHOOK=$use_webhook
SERVER_URL=$server_url
AUTO_SETUP_WEBHOOK=true
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

echo "Your bot is now running!"
echo ""

if [ "$use_webhook" = "true" ]; then
  echo "You can access the bot's web interface at: https://$domain"
  echo "Your bot webhook is set to: https://$domain/bot$bot_token"
else
  echo "Your bot is running in polling mode."
  IP_ADDRESS=$(curl -s ifconfig.me)
  echo "You can access the bot's web interface at: http://$IP_ADDRESS:3000"
fi

echo ""
echo "Useful commands:"
echo "- Check service status: systemctl status ytdlp-bot"
echo "- View logs: journalctl -u ytdlp-bot -f"
echo "- Restart the bot: systemctl restart ytdlp-bot"
echo ""
echo "Enjoy your bot!"
