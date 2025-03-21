@echo off
setlocal enabledelayedexpansion

echo.
echo ========================================
echo   YT-DLP Telegram Bot Windows Deployer
echo ========================================
echo.
echo Starting deployment process...
echo.

:: Check for admin privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Please run this script as Administrator
    echo Right-click on the script and select "Run as administrator"
    pause
    exit /b 1
)

:: Get configuration immediately
set /p BOT_TOKEN=Enter your Telegram Bot Token: 

if "%BOT_TOKEN%"=="" (
    echo Bot token cannot be empty
    pause
    exit /b 1
)

set /p USE_WEBHOOK=Do you want to use webhook mode? (y/n) [n]: 
if /i "%USE_WEBHOOK%"=="y" (
    set USE_WEBHOOK=true
    set /p SERVER_URL=Enter your server URL (with https://): 
    
    if "!SERVER_URL!"=="" (
        echo Server URL cannot be empty when using webhook mode
        pause
        exit /b 1
    )
) else (
    set USE_WEBHOOK=false
    set SERVER_URL=
)

:: Display configuration summary
echo.
echo Configuration Summary:
echo Telegram Bot Token: [hidden for security]
if /i "%USE_WEBHOOK%"=="true" (
    echo Webhook Mode: Enabled
    echo Server URL: %SERVER_URL%
) else (
    echo Webhook Mode: Disabled (using polling)
)

echo.
set /p CONFIRM=Do you want to proceed with the installation? (y/n) [y]: 
if /i "!CONFIRM!" neq "y" (
    if /i "!CONFIRM!" neq "" (
        echo Installation aborted by user
        pause
        exit /b 1
    )
)

echo.
echo Beginning installation process...

:: Check for Node.js
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo Node.js is not installed or not in your PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: Check for yt-dlp
where yt-dlp >nul 2>&1
if %errorLevel% neq 0 (
    echo yt-dlp is not installed or not in your PATH
    echo Installing yt-dlp...
    
    :: Create bin directory if it doesn't exist
    if not exist "%USERPROFILE%\bin" mkdir "%USERPROFILE%\bin"
    
    :: Download yt-dlp
    echo Downloading yt-dlp...
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' -OutFile '%USERPROFILE%\bin\yt-dlp.exe'"
    
    :: Add to PATH for current session
    set "PATH=%PATH%;%USERPROFILE%\bin"
    
    :: Add to PATH permanently
    setx PATH "%PATH%;%USERPROFILE%\bin"
    
    echo yt-dlp installed to %USERPROFILE%\bin
)

:: Check for ffmpeg
where ffmpeg >nul 2>&1
if %errorLevel% neq 0 (
    echo FFmpeg is not installed or not in your PATH
    echo Please install FFmpeg from https://ffmpeg.org/download.html
    echo and make sure it's in your PATH
    echo.
    echo You can continue without FFmpeg, but some video downloads may fail
    echo.
    set /p continue="Continue anyway? (y/n): "
    if /i "!continue!" neq "y" exit /b 1
)

:: Create .env file
echo Creating .env file...
(
    echo TELEGRAM_BOT_TOKEN=%BOT_TOKEN%
    echo PORT=3000
    echo USE_WEBHOOK=%USE_WEBHOOK%
    echo SERVER_URL=%SERVER_URL%
    echo AUTO_SETUP_WEBHOOK=true
    echo NODE_ENV=production
) > .env

:: Install Node.js dependencies
echo Installing Node.js dependencies...
call npm install --production

:: Create startup batch file
echo Creating startup script...
(
    echo @echo off
    echo cd "%CD%"
    echo node index.js
) > start-bot.bat

:: Create scheduled task
echo Setting up scheduled task to run at startup...
schtasks /create /tn "YT-DLP Telegram Bot" /tr "%CD%\start-bot.bat" /sc onstart /ru SYSTEM /f

:: Start the bot
echo Starting the bot...
start "YT-DLP Telegram Bot" cmd /c node index.js

echo.
echo =======================================
echo   YT-DLP Telegram Bot Setup Complete
echo =======================================
echo.
echo Your bot is now running!
echo.
echo To make sure the bot starts automatically when you reboot:
echo 1. Check Task Scheduler to confirm the "YT-DLP Telegram Bot" task is created
echo 2. You can manually start the bot by running start-bot.bat
echo.
echo Enjoy your bot!
echo.
pause
