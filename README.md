# YT-DLP Telegram Bot

A Telegram bot that downloads videos from various platforms using yt-dlp. Deployed on Azure Virtual Machine.

## Features

- Download videos from YouTube, Twitter, Instagram, and other supported platforms
- Select video quality (Best, 480p, 720p, 1080p, or audio only)
- Persistent deployment on Azure VM

## Prerequisites

- Node.js 16+
- Azure account with subscription
- Telegram Bot token (from [@BotFather](https://t.me/BotFather))
- Domain name (optional but recommended for webhook mode)

## Quick Deployment with Script

### Linux/Ubuntu (Azure VM)

The fastest way to deploy is using our automated script:

1. Create an Azure VM with Ubuntu 20.04 LTS
2. Connect to your VM using SSH
3. Clone the repository:
   ```bash
   git clone https://github.com/khushveer007/ytdlp-TgBot.git
   cd ytdlp-TgBot
   ```
4. Make the deployment script executable:
   ```bash
   chmod +x deploy.sh
   ```
5. Run the deployment script with sudo:
   ```bash
   sudo ./deploy.sh
   ```
6. Follow the prompts to configure your bot

The script will:
- Update your system
- Install all required dependencies (Node.js, yt-dlp, ffmpeg)
- Set up Nginx and SSL if you're using a domain
- Create environment configuration
- Install the bot as a system service
- Start the bot automatically

### Windows Deployment

For Windows users:

1. Make sure you have Node.js installed
2. Clone the repository
3. Run `deploy.bat` as Administrator
4. Follow the prompts to configure your bot

## Manual Deployment to Azure VM

If you prefer to set up manually, follow these steps:

### 1. Create an Azure Virtual Machine

1. Sign in to the [Azure Portal](https://portal.azure.com)

2. Click "Create a resource" and search for "Virtual Machine"

3. Configure your VM:
   - **Basics tab:**
     - Subscription: Select your subscription
     - Resource Group: Create a new one or use existing
     - Virtual Machine Name: Choose a name (e.g., ytdlp-bot-vm)
     - Region: Select a region close to your users
     - Availability options: No infrastructure redundancy required
     - Image: Ubuntu Server 20.04 LTS (or later)
     - Size: Standard B1s (1 vCPU, 1 GB RAM) is sufficient
   
   - **Administrator Account:**
     - Authentication type: Password
     - Username: Create a username
     - Password: Create a secure password
   
   - **Inbound Port Rules:**
     - Allow SSH (port 22)
     - Allow HTTP (port 80)
     - Allow HTTPS (port 443)

4. Review + Create > Create

5. Wait for the deployment to complete and then click "Go to resource"

### 2. Configure Domain Name (Optional but Recommended)

1. If you have a domain, configure a DNS A record to point to your VM's public IP address
2. If not, you can use the Azure VM's public IP or a service like [nip.io](https://nip.io) (e.g., `your-ip.nip.io`)

### 3. Connect to the VM and Install Dependencies

1. Find your VM's public IP address in the Azure Portal

2. Connect to the VM using SSH:
   ```bash
   ssh your-username@your-vm-ip
   ```

3. Update the system and install required dependencies:
   ```bash
   sudo apt update
   sudo apt upgrade -y
   
   # Install Node.js
   curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
   sudo apt install -y nodejs gcc g++ make
   
   # Install yt-dlp
   sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
   sudo chmod a+rx /usr/local/bin/yt-dlp
   
   # Install ffmpeg
   sudo apt install -y ffmpeg
   
   # Install Nginx (for SSL termination and reverse proxy)
   sudo apt install -y nginx
   ```

### 4. Clone and Configure the Bot

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/ytdlp-TgBot.git
   cd ytdlp-TgBot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env` file:
   ```bash
   nano .env
   ```

4. Add the following configuration to the `.env` file:
   ```
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
   PORT=3000
   USE_WEBHOOK=false   # Change to true if using a webhook
   SERVER_URL=https://your-domain-or-ip  # Required only for webhook mode
   AUTO_SETUP_WEBHOOK=false   # Change to true to auto-setup webhook on startup
   NODE_ENV=production
   ```

5. Save and exit (Ctrl+O, Enter, Ctrl+X)

### 5. Set Up as a System Service

1. Run the service installation script:
   ```bash
   sudo node install-service.js
   ```

2. Check that the service is running:
   ```bash
   sudo systemctl status ytdlp-bot
   ```

### 6. Configure Nginx as a Reverse Proxy (Optional but Recommended)

1. Create an Nginx configuration file:
   ```bash
   sudo nano /etc/nginx/sites-available/ytdlp-bot
   ```

2. Add the following configuration:
   ```nginx
   server {
       listen 80;
       server_name your-domain-or-ip;
   
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

3. Enable the site and restart Nginx:
   ```bash
   sudo ln -s /etc/nginx/sites-available/ytdlp-bot /etc/nginx/sites-enabled/
   sudo nginx -t  # Test the configuration
   sudo systemctl restart nginx
   ```

### 7. Set Up SSL with Let's Encrypt (Optional but Recommended)

1. Install Certbot:
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   ```

2. Generate SSL certificate:
   ```bash
   sudo certbot --nginx -d your-domain.com
   ```

3. Follow the prompts and select option to redirect HTTP to HTTPS

### 8. Update Bot Configuration for Webhook Mode (Optional)

If you want to use webhook mode instead of polling:

1. Edit your `.env` file:
   ```bash
   nano .env
   ```

2. Update the webhook settings:
   ```
   USE_WEBHOOK=true
   SERVER_URL=https://your-domain.com
   AUTO_SETUP_WEBHOOK=true
   ```

3. Restart the bot service:
   ```bash
   sudo systemctl restart ytdlp-bot
   ```

### 9. Test Your Bot

1. Open Telegram and search for your bot (by the username you set in BotFather)
2. Start a conversation and test sending a video URL

## Using Different Modes

### Polling Mode (Simpler)

Polling mode is simpler to set up and doesn't require a domain or SSL certificate:

```
USE_WEBHOOK=false
```

The bot will poll Telegram servers for updates. This works well for most use cases.

### Webhook Mode (More Efficient)

Webhook mode is more efficient but requires proper domain and SSL setup:

```
USE_WEBHOOK=true
SERVER_URL=https://your-domain.com
AUTO_SETUP_WEBHOOK=true
```

## Monitoring and Maintenance

### Checking Bot Status

```bash
sudo systemctl status ytdlp-bot
```

### Viewing Logs

```bash
sudo journalctl -u ytdlp-bot -f
```

### Restarting the Bot

```bash
sudo systemctl restart ytdlp-bot
```

### Updating the Bot

```bash
cd ~/ytdlp-TgBot
git pull
npm install
sudo systemctl restart ytdlp-bot
```

## Troubleshooting

### Bot Not Responding

1. Check if the service is running:
   ```bash
   sudo systemctl status ytdlp-bot
   ```

2. Check the logs for errors:
   ```bash
   sudo journalctl -u ytdlp-bot -e
   ```

3. Verify your bot token is correct in the `.env` file

### Webhook Setup Issues

1. Make sure your domain points to your VM's IP address
2. Ensure SSL is properly configured
3. Check that Nginx is properly forwarding requests
4. Try setting up the webhook manually through the web interface

### Video Download Issues

1. Update yt-dlp to the latest version:
   ```bash
   sudo yt-dlp -U
   ```

2. Check if the video is available in your region
3. Check the logs for specific errors

## License

MIT
