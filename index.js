require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const axios = require('axios');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

// Initialize the bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Express app
const app = express();
const port = process.env.PORT || 3000;

// For parsing application/json
app.use(express.json());

// In-memory storage for user states
const userStates = {};

// Welcome message
bot.start((ctx) => {
  ctx.reply('Welcome to YT-DLP Telegram Bot! Send me a video URL, and I will download it for you.');
});

// Help command
bot.help((ctx) => {
  ctx.reply(
    'How to use this bot:\n\n' +
    '1. Send a video URL from YouTube, Twitter, Instagram, etc.\n' +
    '2. Choose the video quality\n' +
    '3. Wait for the download to complete\n\n' +
    'Commands:\n' +
    '/start - Start the bot\n' +
    '/help - Show this help message\n' +
    '/cancel - Cancel the current operation'
  );
});

// Cancel command
bot.command('cancel', (ctx) => {
  const userId = ctx.from.id;
  if (userStates[userId]) {
    delete userStates[userId];
    ctx.reply('Current operation canceled.');
  } else {
    ctx.reply('No active operation to cancel.');
  }
});

// Handle URLs
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const messageText = ctx.message.text;
  
  // URL regex pattern
  const urlPattern = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/;
  
  if (urlPattern.test(messageText)) {
    const url = messageText.trim();
    
    try {
      // Send loading message
      const loadingMsg = await ctx.reply('Fetching available formats...');
      
      // Create temp directory for this request and ensure proper permissions
      const tempDir = path.join(os.tmpdir(), `ytdlp-${userId}-${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true, mode: 0o755 });
      
      // Check yt-dlp version and update if necessary
      try {
        const { stdout: versionOutput } = await exec('yt-dlp --version');
        console.log(`Using yt-dlp version: ${versionOutput.trim()}`);
        
        // Update yt-dlp to avoid issues with newer sites
        await exec('yt-dlp -U', { timeout: 30000 }).catch(e => {
          console.log('Non-critical: Failed to update yt-dlp:', e.message);
        });
      } catch (e) {
        console.error('Error checking yt-dlp version:', e);
      }
      
      // Properly quote/escape the URL to handle special characters
      const escapedUrl = url.replace(/"/g, '\\"');
      
      console.log(`Attempting to fetch formats for URL: ${url}`);
      console.log(`User ID: ${userId}, Temp directory: ${tempDir}`);
      
      // Get available formats using yt-dlp with increased timeout and proper error handling
      const formatCommand = `yt-dlp -F "${escapedUrl}" --no-warnings`;
      console.log(`Executing command: ${formatCommand}`);
      
      const { stdout, stderr } = await exec(formatCommand, { 
        cwd: tempDir,
        timeout: 60000, // Increased timeout to 60 seconds
        env: { ...process.env, PATH: process.env.PATH }
      });
      
      if (stderr) {
        console.warn(`yt-dlp stderr: ${stderr}`);
      }
      
      // Check if yt-dlp returned any usable output
      if (!stdout || stdout.trim() === '') {
        throw new Error('No format information returned by yt-dlp. The URL might be invalid or the content might be restricted.');
      }
      
      console.log(`Format data retrieved, length: ${stdout.length} characters`);
      
      // Parse formats
      const formatLines = stdout.split('\n').filter(line => 
        line.includes('x') && 
        (line.includes('mp4') || line.includes('webm') || line.includes('audio only'))
      );
      
      console.log(`Found ${formatLines.length} compatible formats`);
      
      // If no valid formats found, try with a simpler approach
      if (formatLines.length === 0) {
        // Create quality options even without specific format info
        console.log('No specific formats detected, offering generic quality options');
      }
      
      // Create quality options
      const qualityOptions = [
        { text: '🎬 Best Video (with audio)', callback_data: `quality:${url}:best` },
        { text: '📱 480p', callback_data: `quality:${url}:480` },
        { text: '📱 720p', callback_data: `quality:${url}:720` },
        { text: '🖥️ 1080p', callback_data: `quality:${url}:1080` },
        { text: '🎵 Audio Only', callback_data: `quality:${url}:audio` }
      ];
      
      // Update loading message with format options
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        loadingMsg.message_id,
        null,
        'Choose video quality:',
        {
          reply_markup: {
            inline_keyboard: qualityOptions.map(option => [option])
          }
        }
      );
      
      // Save user state
      userStates[userId] = {
        url,
        tempDir,
        formatLines
      };
      
    } catch (error) {
      console.error('Error fetching formats:', error);
      // Provide more detailed error message based on the error
      let errorMessage = 'Error fetching video information. ';
      
      if (error.message.includes('not found')) {
        errorMessage += 'The URL might be invalid or the video has been removed.';
      } else if (error.message.includes('timeout')) {
        errorMessage += 'The request timed out. The server might be slow or the video is too large.';
      } else if (error.message.includes('permission')) {
        errorMessage += 'Permission denied accessing system resources.';
      } else if (error.message.includes('region') || error.message.includes('country')) {
        errorMessage += 'This content might be region-restricted.';
      } else if (error.message.includes('copyright') || error.message.includes('removed')) {
        errorMessage += 'This content might have been removed due to copyright issues.';
      } else {
        errorMessage += 'Please check if the URL is valid and try again.';
      }
      
      ctx.reply(errorMessage);
      
      // Clean up temp directory if it was created
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmdirSync(tempDir, { recursive: true });
          console.log(`Cleaned up temp directory after error: ${tempDir}`);
        }
      } catch (e) {
        console.error('Error cleaning up temp directory:', e);
      }
    }
  } else {
    ctx.reply('Please send a valid URL.');
  }
});

// Handle quality selection
bot.action(/quality:(.+):(.+)/, async (ctx) => {
  const userId = ctx.from.id;
  const url = ctx.match[1];
  const quality = ctx.match[2];
  
  if (!userStates[userId]) {
    return ctx.reply('Session expired. Please send the URL again.');
  }
  
  // Update message to show download started
  await ctx.editMessageText('Starting download... This may take a while.');
  
  try {
    const tempDir = userStates[userId].tempDir;
    let formatOption = '';
    
    // Set format option based on selected quality
    switch (quality) {
      case 'best':
        formatOption = '-f "best"';
        break;
      case '480':
        formatOption = '-f "bestvideo[height<=480]+bestaudio/best[height<=480]"';
        break;
      case '720':
        formatOption = '-f "bestvideo[height<=720]+bestaudio/best[height<=720]"';
        break;
      case '1080':
        formatOption = '-f "bestvideo[height<=1080]+bestaudio/best[height<=1080]"';
        break;
      case 'audio':
        formatOption = '-f "bestaudio" -x --audio-format mp3';
        break;
      default:
        formatOption = '-f "best"';
    }
    
    // Generate random filename
    const outputFilename = `video_${Date.now()}`;
    const outputPath = path.join(tempDir, outputFilename);
    
    // Properly escape URL to handle special characters
    const escapedUrl = url.replace(/"/g, '\\"');
    
    // Download the video using yt-dlp with additional options for better compatibility
    const downloadCommand = `yt-dlp ${formatOption} --no-warnings --no-check-certificate --prefer-ffmpeg -o "${outputPath}.%(ext)s" "${escapedUrl}"`;
    console.log(`Executing download command: ${downloadCommand}`);
    
    await ctx.editMessageText('Downloading... Please wait.');
    await exec(downloadCommand, { 
      cwd: tempDir,
      timeout: 300000, // 5 minutes timeout for download
      env: { ...process.env, PATH: process.env.PATH }
    });
    
    // Find downloaded file (extension may vary)
    const files = fs.readdirSync(tempDir);
    const downloadedFile = files.find(file => file.startsWith(outputFilename));
    
    if (!downloadedFile) {
      throw new Error('Downloaded file not found');
    }
    
    const filePath = path.join(tempDir, downloadedFile);
    console.log(`Download completed: ${filePath}`);
    
    // Send message based on file size
    const stats = fs.statSync(filePath);
    const fileSizeInMB = stats.size / (1024 * 1024);
    console.log(`File size: ${fileSizeInMB.toFixed(2)} MB`);
    
    if (fileSizeInMB > 50) {
      // File too large for Telegram, provide download link instead
      await ctx.editMessageText('File is too large to send via Telegram (>50MB). Generating download link...');
      
      // Note: In a real implementation, you would upload the file to a storage service
      // and provide a download link. This is a placeholder.
      ctx.reply('File is too large. Consider using a different quality option or downloading a shorter video.');
      
      // Clean up the file immediately
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        console.error('Error deleting file:', e);
      }
    } else {
      // Send the file to Telegram
      await ctx.editMessageText('Upload to Telegram in progress...');
      
      try {
        // Determine if it's audio or video
        const isAudio = quality === 'audio';
        
        if (isAudio) {
          await ctx.telegram.sendAudio({
            chat_id: ctx.chat.id,
            source: fs.readFileSync(filePath),
            filename: downloadedFile
          });
        } else {
          await ctx.telegram.sendVideo({
            chat_id: ctx.chat.id,
            source: fs.readFileSync(filePath),
            filename: downloadedFile
          });
        }
        
        await ctx.editMessageText('Download completed!');
      } catch (sendError) {
        console.error('Error sending file:', sendError);
        await ctx.editMessageText('Error sending file to Telegram: ' + sendError.message);
      } finally {
        // Always clean up the file after sending or on error
        try {
          console.log(`Deleting file: ${filePath}`);
          fs.unlinkSync(filePath);
        } catch (e) {
          console.error('Error deleting file:', e);
        }
      }
    }
    
    // Clean up temp directory and user state
    try {
      fs.rmdirSync(tempDir, { recursive: true });
      console.log(`Cleaned up temp directory: ${tempDir}`);
    } catch (e) {
      console.error('Cleanup error:', e);
    }
    
    delete userStates[userId];
    
  } catch (error) {
    console.error('Download error:', error);
    let errorMessage = `Error downloading video: ${error.message}`;
    
    if (error.message.includes('unavailable') || error.message.includes('not available')) {
      errorMessage = 'The video is unavailable or restricted in your region';
    } else if (error.message.includes('copyright')) {
      errorMessage = 'The video was removed due to copyright issues';
    } else if (error.message.includes('Private video')) {
      errorMessage = 'This is a private video that requires authentication';
    }
    
    ctx.editMessageText(errorMessage);
    
    // Clean up on error
    if (userStates[userId] && userStates[userId].tempDir) {
      try {
        fs.rmdirSync(userStates[userId].tempDir, { recursive: true });
      } catch (e) {
        console.error('Cleanup error:', e);
      }
    }
    
    delete userStates[userId];
  }
});

// Helper function to set up webhook
async function setupWebhook(baseUrl) {
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      console.error('TELEGRAM_BOT_TOKEN is not defined');
      return { success: false, message: 'TELEGRAM_BOT_TOKEN is not defined' };
    }

    // Get server URL
    const webhookUrl = `${baseUrl}/bot${process.env.TELEGRAM_BOT_TOKEN}`;
    console.log(`Setting webhook to: ${webhookUrl}`);

    const response = await bot.telegram.setWebhook(webhookUrl);
    console.log('Webhook set successfully', response);
    return { success: true, message: 'Webhook set successfully', data: response };
  } catch (error) {
    console.error('Error setting webhook:', error);
    return { success: false, message: `Error setting webhook: ${error.message}` };
  }
}

// Get bot server URL from environment or from request
function getServerUrl(req) {
  // First try from environment variables
  if (process.env.SERVER_URL) {
    return process.env.SERVER_URL;
  }
  
  // Then try from request headers with appropriate protocol
  if (req && req.headers && req.headers.host) {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    return `${protocol}://${req.headers.host}`;
  }
  
  // Default fallback
  return `http://localhost:${port}`;
}

// Determine whether to use webhook or polling
const useWebhook = process.env.USE_WEBHOOK === 'true';

if (useWebhook) {
  // Webhook endpoint
  app.post(`/bot${process.env.TELEGRAM_BOT_TOKEN}`, (req, res) => {
    bot.handleUpdate(req.body, res);
    res.status(200).send('OK');
  });
  
  console.log('Bot is configured for webhook mode');
} else {
  // Start polling for development or simple VM setup
  bot.launch().then(() => {
    console.log('Bot is running in polling mode');
  });
}

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Setup success page
app.get('/setup-success', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Setup webhook endpoint
app.post('/setup-webhook', async (req, res) => {
  try {
    const serverUrl = getServerUrl(req);
    const result = await setupWebhook(serverUrl);
    
    res.json(result);
  } catch (error) {
    console.error('Error in setup-webhook endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Error setting webhook',
      error: error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  const hostname = os.hostname();
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    hostname: hostname,
    tempDir: os.tmpdir(),
    uptime: process.uptime()
  });
});

// Add cleanup endpoint for maintenance
app.post('/maintenance/cleanup', async (req, res) => {
  try {
    const tempDirBase = os.tmpdir();
    const ytdlpDirs = fs.readdirSync(tempDirBase)
      .filter(dir => dir.startsWith('ytdlp-'))
      .map(dir => path.join(tempDirBase, dir));
    
    let cleanedCount = 0;
    for (const dir of ytdlpDirs) {
      try {
        fs.rmdirSync(dir, { recursive: true });
        cleanedCount++;
      } catch (e) {
        console.error(`Error cleaning directory ${dir}:`, e);
      }
    }
    
    res.json({
      success: true,
      message: `Cleaned up ${cleanedCount} temporary directories`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Serve static files
app.use(express.static('public'));

// Start the server
const server = app.listen(port, async () => {
  console.log(`Server is running on port ${port}`);
  
  // Check and update yt-dlp at startup
  try {
    console.log('Checking yt-dlp version...');
    const { stdout: versionBefore } = await exec('yt-dlp --version');
    console.log(`Current yt-dlp version: ${versionBefore.trim()}`);
    
    console.log('Updating yt-dlp...');
    const { stdout: updateOutput } = await exec('yt-dlp -U');
    console.log(updateOutput);
    
    const { stdout: versionAfter } = await exec('yt-dlp --version');
    console.log(`yt-dlp version after update: ${versionAfter.trim()}`);
  } catch (error) {
    console.error('Error updating yt-dlp:', error.message);
    console.log('Continuing with current yt-dlp version');
  }
  
  // Auto setup webhook if enabled
  if (useWebhook && process.env.AUTO_SETUP_WEBHOOK === 'true') {
    try {
      console.log('Attempting automatic webhook setup...');
      
      // Wait a moment to ensure the server is fully started
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const serverUrl = process.env.SERVER_URL;
      if (!serverUrl) {
        console.error('SERVER_URL environment variable not set. Cannot auto-setup webhook.');
        return;
      }
      
      const result = await setupWebhook(serverUrl);
      
      if (result.success) {
        console.log('Automatic webhook setup complete!');
      } else {
        console.error('Automatic webhook setup failed:', result.message);
      }
    } catch (error) {
      console.error('Error during automatic webhook setup:', error);
    }
  }
  
  // Setup periodic cleanup task every hour
  setInterval(() => {
    try {
      const tempDirBase = os.tmpdir();
      const ytdlpDirs = fs.readdirSync(tempDirBase)
        .filter(dir => dir.startsWith('ytdlp-'));
      
      console.log(`Running scheduled cleanup task. Found ${ytdlpDirs.length} directories to check.`);
      
      for (const dir of ytdlpDirs) {
        const dirPath = path.join(tempDirBase, dir);
        try {
          // Get directory stats to check age
          const stats = fs.statSync(dirPath);
          const ageInHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
          
          // Clean up directories older than 3 hours
          if (ageInHours > 3) {
            fs.rmdirSync(dirPath, { recursive: true });
            console.log(`Cleaned up old directory: ${dirPath}`);
          }
        } catch (e) {
          console.error(`Error processing directory ${dirPath}:`, e);
        }
      }
    } catch (error) {
      console.error('Error in scheduled cleanup task:', error);
    }
  }, 60 * 60 * 1000); // Run every hour
});
