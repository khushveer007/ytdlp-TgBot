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
  
  # Read user input with a timeout to ensure it works properly across different terminals
  read -r user_input
  if [ -z "$user_input" ] && [ -n "$default_val" ]; then
    # Return default values
    echo "$default_val"
  else
    # Return user input
    echo "$user_input"
  fi
}
# Ask for confirmation to run the script
echo -e "${YELLOW}This script will deploy the YT-DLP Telegram Bot.${NC}"
echo "It will install required packages, set up system services, and configure the bot."
echo "" "${YELLOW}This script will deploy the YT-DLP Telegram Bot.${NC}"
run_script=$(prompt "Do you want to run this script? (y/n)" "y") and configure the bot."
echo ""
if [[ "$run_script" =~ ^[Yy]$ ]] || [[ "$run_script" == "y" ]]; theny")
  echo -e "${GREEN}Proceeding with script execution...${NC}"
elseobust comparison for yes/no responses
  echo -e "${RED}Script execution cancelled by user.${NC}" [[ "$run_script" =~ ^[Yy]$ ]] || [[ "$run_script" == "y" ]]; then
  exit 0  echo -e "${GREEN}Proceeding with script execution...${NC}"
fi
NC}"
echo ""0
echo -e "${YELLOW}Starting deployment process...${NC}"fi
echo ""

# Collect all configuration values up front "${YELLOW}Starting deployment process...${NC}"
progress "Collecting necessary information..."echo ""
echo ""
# Collect all configuration values up front
bot_token=$(prompt "Enter your Telegram Bot Token" "")y information..."

while [ -z "$bot_token" ]; do
  error "Bot token cannot be empty"token=$(prompt "Enter your Telegram Bot Token" "")
  bot_token=$(prompt "Enter your Telegram Bot Token" "")
done
Bot token cannot be empty"
use_domain=$(prompt "Do you want to set up a domain name? (y/n)" "n")  bot_token=$(prompt "Enter your Telegram Bot Token" "")
domain=""

if [ "$use_domain" = "y" ] || [ "$use_domain" = "Y" ]; thene_domain=$(prompt "Do you want to set up a domain name? (y/n)" "n")
  domain=$(prompt "Enter your domain name (e.g., bot.example.com)" "")
  
  while [ -z "$domain" ]; do
    error "Domain name cannot be empty"in=$(prompt "Enter your domain name (e.g., bot.example.com)" "")
    domain=$(prompt "Enter your domain name (e.g., bot.example.com)" "")
  donen" ]; do
  be empty"
  use_webhook="true"domain=$(prompt "Enter your domain name (e.g., bot.example.com)" "")
  server_url="https://$domain"
else
  use_webhook="false"
  server_url=""server_url="https://$domain"
  warning "Running without a domain name. The bot will use polling mode."else
fi
r_url=""
# Ask for confirmation before proceedingbot will use polling mode."
echo ""
echo -e "${YELLOW}Configuration Summary:${NC}"
echo "Telegram Bot Token: [hidden for security]"
echo "Use Domain: $use_domain"
if [ "$use_domain" = "y" ] || [ "$use_domain" = "Y" ]; thenn Summary:${NC}"
  echo "Domain: $domain" "Telegram Bot Token: [hidden for security]"
  echo "Webhook Mode: Enabled"
else [ "$use_domain" = "y" ] || [ "$use_domain" = "Y" ]; then
  echo "Webhook Mode: Disabled (using polling)"  echo "Domain: $domain"
fi"Webhook Mode: Enabled"

echo ""  echo "Webhook Mode: Disabled (using polling)"
proceed=$(prompt "Do you want to proceed with the installation? (y/n)" "y")

# More robust comparison
if [[ "$proceed" =~ ^[Yy]$ ]] || [[ "$proceed" == "y" ]]; thenoceed=$(prompt "Do you want to proceed with the installation? (y/n)" "y")
  echo -e "${GREEN}Proceeding with installation...${NC}"
elseproceed" != "y" ] && [ "$proceed" != "Y" ]; then
  error "Installation aborted by user"
  exit 1  exit 1
fi

echo ""
progress "Beginning installation process..."progress "Beginning installation process..."

# Update system and install dependencies
progress "Updating system packages..."..."
apt updateapt update

progress "Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_16.x | bash -e.com/setup_16.x | bash -
apt install -y nodejs gcc g++ makeapt install -y nodejs gcc g++ make

progress "Installing yt-dlp..."yt-dlp..."
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlpcurl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod a+rx /usr/local/bin/yt-dlp

progress "Installing ffmpeg..."
apt install -y ffmpeg

# Check if we need to install Nginxto install Nginx
if [ "$use_webhook" = "true" ]; thenhen
  progress "Installing Nginx and Certbot..."progress "Installing Nginx and Certbot..."
  apt install -y nginx certbot python3-certbot-nginxot python3-certbot-nginx
  
  # Configure Nginxigure Nginx
  progress "Configuring Nginx..."nfiguring Nginx..."
  
  # Create Nginx config file  # Create Nginx config file
  cat > /etc/nginx/sites-available/ytdlp-bot <<EOFnx/sites-available/ytdlp-bot <<EOF
server {
    listen 80;
    server_name $domain;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';   proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;       proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;     proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;X-Forwarded-Proto \$scheme;
    }
}
EOFF
  
  # Enable the Nginx site
  ln -sf /etc/nginx/sites-available/ytdlp-bot /etc/nginx/sites-enabled/
  nginx -t && systemctl restart nginxnginx -t && systemctl restart nginx
    
  # Set up SSL with Let's Encryptt's Encrypt
  progress "Setting up SSL with Let's Encrypt..."SL with Let's Encrypt..."
  certbot --nginx -d "$domain" --non-interactive --agree-tos --email admin@"$domain" --redirect --agree-tos --email admin@"$domain" --redirect
fi

# Create bot directory
BOT_DIR="/opt/ytdlp-bot"p-bot"
progress "Creating bot directory at $BOT_DIR..."DIR..."
mkdir -p "$BOT_DIR"

# Copy all files from current directory to bot directoryCopy all files from current directory to bot directory
current_dir=$(pwd)current_dir=$(pwd)
if [ "$current_dir" != "$BOT_DIR" ]; then= "$BOT_DIR" ]; then
  progress "Copying bot files to $BOT_DIR..."opying bot files to $BOT_DIR..."
  cp -R * "$BOT_DIR/" 2>/dev/null || true  cp -R * "$BOT_DIR/" 2>/dev/null || true
fi

# Go to bot directory
cd "$BOT_DIR"

# Create .env file
progress "Creating environment configuration..."ironment configuration..."
cat > "$BOT_DIR/.env" <<EOF<EOF
TELEGRAM_BOT_TOKEN=$bot_token$bot_token
PORT=3000T=3000
USE_WEBHOOK=$use_webhookUSE_WEBHOOK=$use_webhook
SERVER_URL=$server_url
AUTO_SETUP_WEBHOOK=true
NODE_ENV=production
EOFEOF

# Install node dependencies
progress "Installing Node.js dependencies..."
npm install --productionstall --production

# Create systemd servicevice
progress "Setting up systemd service..."progress "Setting up systemd service..."
cat > /etc/systemd/system/ytdlp-bot.service <<EOFc/systemd/system/ytdlp-bot.service <<EOF
[Unit]
Description=YT-DLP Telegram Bot-DLP Telegram Bot
After=network.targetwork.target

[Service]
ExecStart=/usr/bin/node $BOT_DIR/index.jsBOT_DIR/index.js
Restart=alwaysRestart=always
User=root
Group=root
Environment=PATH=/usr/bin:/usr/local/binironment=PATH=/usr/bin:/usr/local/bin
WorkingDirectory=$BOT_DIRWorkingDirectory=$BOT_DIR

[Install]
WantedBy=multi-user.targetget
EOF

# Enable and start the service# Enable and start the service
progress "Starting bot service...""
systemctl daemon-reloadad
systemctl enable ytdlp-botdlp-bot
systemctl start ytdlp-bot

# Check service status with retryervice status with retry
service_running=falsee_running=false
for i in {1..5}; do
  if systemctl is-active --quiet ytdlp-bot; thenctl is-active --quiet ytdlp-bot; then
    service_running=trueservice_running=true
    breakbreak
  else  else
    echo "Waiting for service to start (attempt $i/5)..."vice to start (attempt $i/5)..."
    sleep 2
  fi
done

if $service_running; then $service_running; then
  progress "Bot service is running!"  progress "Bot service is running!"
else
  error "Failed to start bot service. Check logs with: journalctl -u ytdlp-bot -e" start bot service. Check logs with: journalctl -u ytdlp-bot -e"
  exit 1
fi

# Final instructionstions
echo -e "${GREEN}"echo -e "${GREEN}"
echo "======================================"============="
echo "  YT-DLP Telegram Bot Setup Complete  " YT-DLP Telegram Bot Setup Complete  "
echo "======================================"echo "======================================"
echo -e "${NC}"

echo "Your bot is now running!"
echo "" ""

if [ "$use_webhook" = "true" ]; thenn
  echo "You can access the bot's web interface at: https://$domain"
  echo "Your bot webhook is set to: https://$domain/bot$bot_token"echo "Your bot webhook is set to: https://$domain/bot$bot_token"
elseelse
  echo "Your bot is running in polling mode.""Your bot is running in polling mode."
  IP_ADDRESS=$(curl -s ifconfig.me)ifconfig.me)
  echo "You can access the bot's web interface at: http://$IP_ADDRESS:3000"/$IP_ADDRESS:3000"
fi

echo ""
echo "Useful commands:""
echo "- Check service status: systemctl status ytdlp-bot"echo "- Check service status: systemctl status ytdlp-bot"





echo "Enjoy your bot!"echo ""echo "- Restart the bot: systemctl restart ytdlp-bot"echo "- View logs: journalctl -u ytdlp-bot -f"echo "- View logs: journalctl -u ytdlp-bot -f"
echo "- Restart the bot: systemctl restart ytdlp-bot"
echo ""
echo "Enjoy your bot!"
