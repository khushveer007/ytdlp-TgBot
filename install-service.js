const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Determine if running on Linux or Windows
const isLinux = process.platform === 'linux';
const currentPath = process.cwd();

if (isLinux) {
  // Create systemd service file
  const serviceContent = `[Unit]
Description=YT-DLP Telegram Bot
After=network.target

[Service]
ExecStart=/usr/bin/node ${path.join(currentPath, 'index.js')}
Restart=always
User=${process.env.USER || 'root'}
Group=${process.env.USER || 'root'}
Environment=PATH=/usr/bin:/usr/local/bin
Environment=NODE_ENV=production
WorkingDirectory=${currentPath}

[Install]
WantedBy=multi-user.target
`;

  fs.writeFileSync('/tmp/ytdlp-bot.service', serviceContent);
  console.log('Created service file: /tmp/ytdlp-bot.service');

  try {
    // Move service file to systemd directory and enable it
    execSync('sudo mv /tmp/ytdlp-bot.service /etc/systemd/system/');
    execSync('sudo systemctl daemon-reload');
    execSync('sudo systemctl enable ytdlp-bot');
    execSync('sudo systemctl start ytdlp-bot');
    
    console.log('Service installed and started successfully!');
    console.log('You can check status with: sudo systemctl status ytdlp-bot');
  } catch (error) {
    console.error('Error installing service:', error.message);
    console.log('You may need to manually move the service file and enable it:');
    console.log('sudo mv /tmp/ytdlp-bot.service /etc/systemd/system/');
    console.log('sudo systemctl daemon-reload');
    console.log('sudo systemctl enable ytdlp-bot');
    console.log('sudo systemctl start ytdlp-bot');
  }
} else if (process.platform === 'win32') {
  // For Windows, create a batch file to run as a scheduled task
  const batchContent = `@echo off
cd "${currentPath}"
node index.js
`;

  const batchPath = path.join(currentPath, 'start-bot.bat');
  fs.writeFileSync(batchPath, batchContent);
  console.log(`Created batch file: ${batchPath}`);
  
  console.log('To run the bot as a Windows service:');
  console.log('1. Open Task Scheduler');
  console.log('2. Create a new Basic Task');
  console.log(`3. Set the action to start a program: ${batchPath}`);
  console.log('4. Configure to run at startup and when logged on');
} else {
  console.log('Unsupported operating system. Please manually set up the service.');
}
