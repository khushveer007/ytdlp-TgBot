# YT-DLP Telegram Bot

A Telegram bot that downloads videos from various platforms using yt-dlp. Hosted on Heroku.

## Features

- Download videos from YouTube, Twitter, Instagram, and other supported platforms
- Select video quality (Best, 480p, 720p, 1080p, or audio only)
- Easy deployment on Heroku with one-click setup

## Prerequisites

- Node.js 16+
- Heroku account
- Telegram Bot token (from [@BotFather](https://t.me/BotFather))

## One-Click Deployment

The easiest way to deploy this bot is using the Heroku Deploy Button:

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

1. Click the "Deploy to Heroku" button
2. Fill in your Telegram Bot Token (get it from [@BotFather](https://t.me/BotFather))
3. Choose a name for your app
4. Click "Deploy app"
5. After deployment, click "View" to visit your app
6. On the app page, click the "Set Up Webhook" button if it's not automatically set up

## Manual Setup Instructions

If you prefer to set up manually:

1. Clone this repository:
   ```
   git clone https://github.com/yourusername/ytdlp-TgBot.git
   cd ytdlp-TgBot
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file with your Telegram Bot token:
   ```
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
   ```

4. For local development, run:
   ```
   npm run dev
   ```

## Deployment to Heroku

### Method 1: Deploy with Heroku CLI

1. Install the Heroku CLI:
   ```
   npm install -g heroku
   ```

2. Login to Heroku:
   ```
   heroku login
   ```

3. Create a new Heroku app:
   ```
   heroku create your-app-name
   ```

4. Add the required buildpacks:
   ```
   heroku buildpacks:set heroku/nodejs
   heroku buildpacks:add https://github.com/jonathanong/heroku-buildpack-ffmpeg-latest.git
   heroku buildpacks:add https://github.com/xrisk/heroku-buildpack-yt-dlp
   ```

5. Set the environment variables:
   ```
   heroku config:set TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
   heroku config:set NODE_ENV=production
   heroku config:set AUTO_SETUP_WEBHOOK=true
   ```

6. Deploy to Heroku:
   ```
   git push heroku main
   ```

## How It Works

1. The bot receives webhook updates from Telegram
2. When a user sends a video URL, the bot fetches available formats using yt-dlp
3. The user selects their preferred quality
4. The bot downloads the video and sends it back to the user via Telegram

## Automatic Webhook Setup

The bot is designed with automatic webhook setup:

1. When deployed to Heroku with `AUTO_SETUP_WEBHOOK=true`, it will automatically configure the webhook
2. You can also manually set up the webhook by visiting your app and clicking the "Set Up Webhook" button
3. The webhook configuration connects your Telegram bot to your Heroku app

## Limitations

- Telegram has a 50MB limit for file uploads
- Heroku has a 30-second timeout for web requests
- Heroku's ephemeral filesystem means files are not persisted between restarts

## License

MIT
