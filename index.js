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
      
      // Check if this is a YouTube URL
      const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
      
      console.log(`Processing URL: ${url}`);
      console.log(`User ID: ${userId}, Temp directory: ${tempDir}, isYouTube: ${isYouTube}`);
      
      // Special command for YouTube videos with additional compatibility options
      let formatCommand;
      if (isYouTube) {
        formatCommand = [
          'yt-dlp',
          '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          '-F',
          '--no-warnings',
          '--no-check-certificate',
          '--geo-bypass',
          '--extractor-args', 'youtube:player_client=web',
          url
        ];
        console.log(`Executing YouTube command: ${formatCommand.join(' ')}`);
      } else {
        formatCommand = [
          'yt-dlp',
          '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          '-F',
          '--no-warnings',
          url
        ];
        console.log(`Executing generic command: ${formatCommand.join(' ')}`);
      }
      
      // Execute the command using Node's spawn to avoid shell parsing issues
      const { stdout, stderr } = await exec(formatCommand.join(' '), { 
        cwd: tempDir,
        timeout: 90000, // 90 seconds timeout
        env: { ...process.env, PATH: process.env.PATH }
      });
      
      // Check for errors
      if (stderr && stderr.trim() !== '') {
        console.warn(`yt-dlp stderr: ${stderr}`);
      }
      
      if (!stdout || stdout.trim() === '') {
        console.error('No format information returned by yt-dlp');
        throw new Error('No format information returned. The URL might be invalid or content might be restricted.');
      }
      
      console.log(`Format data retrieved, length: ${stdout.length} characters`);
      
      // Parse formats with a more relaxed approach
      const formatLines = stdout
        .split('\n')
        .filter(line => line.trim() !== '' && (line.includes('mp4') || line.includes('webm') || line.includes('m4a') || line.toLowerCase().includes('audio') || line.toLowerCase().includes('video')));
      
      console.log(`Found ${formatLines.length} compatible formats`);
      
      // Create quality options - use the appropriate display for YouTube vs other platforms
      const qualityOptions = isYouTube ? [
        { text: '🎬 Best Video (HD)', callback_data: `quality:${url}:best` },
        { text: '📱 480p (SD)', callback_data: `quality:${url}:480` },
        { text: '📱 720p (HD)', callback_data: `quality:${url}:720` },
        { text: '🖥️ 1080p (Full HD)', callback_data: `quality:${url}:1080` },
        { text: '🎵 MP3 Audio Only', callback_data: `quality:${url}:audio` }
      ] : [
        { text: '🎬 Best Quality', callback_data: `quality:${url}:best` },
        { text: '📱 Medium Quality', callback_data: `quality:${url}:720` },
        { text: '📱 Lower Quality', callback_data: `quality:${url}:480` },
        { text: '🎵 Audio Only', callback_data: `quality:${url}:audio` }
      ];
      
      // Update message with format options
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
        formatLines,
        isYouTube
      };
      
    } catch (error) {
      console.error('Error fetching formats:', error);
      
      // Get the full error details for debugging
      console.error('Full error:', error.stack);
      
      // Provide more detailed error message based on the error
      let errorMessage = 'Error fetching video information. ';
      
      if (error.message.includes('not found') || error.message.includes('No such file')) {
        errorMessage += 'The URL might be invalid or the video has been removed.';
      } else if (error.message.includes('timeout')) {
        errorMessage += 'The request timed out. The server might be slow or the video is too large.';
      } else if (error.message.includes('permission')) {
        errorMessage += 'Permission denied accessing system resources.';
      } else if (error.message.includes('region') || error.message.includes('country')) {
        errorMessage += 'This content might be region-restricted. Try again with a different video.';
      } else if (error.message.includes('copyright') || error.message.includes('removed')) {
        errorMessage += 'This content might have been removed due to copyright issues.';
      } else if (error.message.includes('private') || error.message.includes('Private')) {
        errorMessage += 'This appears to be a private video that requires authentication.';
      } else if (error.message.includes('unavailable')) {
        errorMessage += 'This video is currently unavailable.';
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
    const isYouTube = userStates[userId].isYouTube || url.includes('youtube.com') || url.includes('youtu.be');
    let formatOption = '';
    
    // Set format option based on selected quality
    // For YouTube, use more specific format selectors
    if (isYouTube) {
      switch (quality) {
        case 'best':
          formatOption = '-f "bestvideo+bestaudio/best" --merge-output-format mp4';
          break;
        case '480':
          formatOption = '-f "bestvideo[height<=480]+bestaudio/best[height<=480]" --merge-output-format mp4';
          break;
        case '720':
          formatOption = '-f "bestvideo[height<=720]+bestaudio/best[height<=720]" --merge-output-format mp4';
          break;
        case '1080':
          formatOption = '-f "bestvideo[height<=1080]+bestaudio/best[height<=1080]" --merge-output-format mp4';
          break;
        case 'audio':
          formatOption = '-f "bestaudio" -x --audio-format mp3';
          break;
        default:
          formatOption = '-f "bestvideo+bestaudio/best" --merge-output-format mp4';
      }
    } else {
      // For non-YouTube URLs, use the original format options
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
    }
    
    // Generate random filename
    const outputFilename = `video_${Date.now()}`;
    const outputPath = path.join(tempDir, outputFilename);
    
    // Build the command parts to avoid shell escaping issues
    let downloadParts = [
      'yt-dlp',
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      ...formatOption.split(' '),
      '--no-warnings',
      '--no-check-certificate',
      '--prefer-ffmpeg'
    ];
    
    // Add YouTube-specific options
    if (isYouTube) {
      downloadParts = [
        ...downloadParts,
        '--geo-bypass',
        '--extractor-args', 'youtube:player_client=web'
      ];
    }
    
    // Add output path and URL
    downloadParts = [
      ...downloadParts,
      '-o', `${outputPath}.%(ext)s`,
      url
    ];
    
    // Join parts into a command
    const downloadCommand = downloadParts.join(' ');
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
    } else if (error.message.includes('sign in')) {
      errorMessage = 'This video requires you to sign in (age-restricted or private content)';
    } else if (error.message.includes('video is too large')) {
      errorMessage = 'Video is too large to process. Try a lower quality option.';
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
  
  // Check and update yt-dlp at startup - this is critical
  try {
    console.log('Checking yt-dlp version...');
    const { stdout: versionBefore } = await exec('yt-dlp --version');
    console.log(`Current yt-dlp version: ${versionBefore.trim()}`);
    
    console.log('Updating yt-dlp...');
    const { stdout: updateOutput } = await exec('yt-dlp -U');
    console.log(updateOutput);
    
    // Test yt-dlp with a simple query to verify it works
    console.log('Testing yt-dlp with a sample YouTube URL...');
    const { stdout: testOutput } = await exec('yt-dlp --no-warnings --simulate --print title https://www.youtube.com/watch?v=jNQXAC9IVRw');
    console.log(`Test successful, found video: ${testOutput.trim()}`);
    
    const { stdout: versionAfter } = await exec('yt-dlp --version');
    console.log(`yt-dlp version after update: ${versionAfter.trim()}`);
  } catch (error) {
    console.error('Error updating yt-dlp:', error.message);
    console.log('Warning: yt-dlp might not be working correctly. Please check installation.');
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
