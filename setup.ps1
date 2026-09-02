$ErrorActionPreference = 'Stop'

Write-Host "Cine Universe API setup" -ForegroundColor Cyan
Write-Host "" 

$tmdb = Read-Host "TMDB API Key"
$bot = Read-Host "Telegram Bot Token"
$admin = Read-Host "Admin Key"

$uploadChannel = Read-Host "Movie Upload Channel Chat ID (default: @Dinidu2026)"
if ([string]::IsNullOrWhiteSpace($uploadChannel)) { $uploadChannel = "@Dinidu2026" }

$updateChannel = Read-Host "Update Channel Chat ID (default: @dinidu20030304)"
if ([string]::IsNullOrWhiteSpace($updateChannel)) { $updateChannel = "@dinidu20030304" }

$requestGroup = Read-Host "Public Movie Request Group Chat ID (optional, default: -5592309385)"
if ([string]::IsNullOrWhiteSpace($requestGroup)) { $requestGroup = "-5592309385" }

$channel = Read-Host "Telegram Channel URL (default: https://t.me/dinidu20030304)"
if ([string]::IsNullOrWhiteSpace($channel)) { $channel = "https://t.me/dinidu20030304" }

$botUrl = Read-Host "Telegram Bot URL (default: https://t.me/CINE_UNIVERSE_OFFCIALS_BOT)"
if ([string]::IsNullOrWhiteSpace($botUrl)) { $botUrl = "https://t.me/CINE_UNIVERSE_OFFCIALS_BOT" }

$botUsername = Read-Host "Telegram Bot Username (default: CINE_UNIVERSE_OFFCIALS_BOT)"
if ([string]::IsNullOrWhiteSpace($botUsername)) { $botUsername = "CINE_UNIVERSE_OFFCIALS_BOT" }

$miniApp = Read-Host "Public Mini App URL (optional; leave blank for local testing)"

$enableAuto = Read-Host "Enable automatic Channel A/B publishing? (Y/n)"
if ([string]::IsNullOrWhiteSpace($enableAuto)) { $enableAuto = "Y" }
$enableAuto = if ($enableAuto -match '^[Yy]') { 'true' } else { 'false' }

@"
TMDB_API_KEY=$tmdb
TELEGRAM_BOT_TOKEN=$bot
ADMIN_KEY=$admin
MOVIE_UPLOAD_CHANNEL_CHAT_ID=$uploadChannel
UPDATE_CHANNEL_CHAT_ID=$updateChannel
MOVIE_REQUEST_GROUP_CHAT_ID=$requestGroup
ENABLE_CHANNEL_AUTOPUBLISH=$enableAuto
CHANNEL_POLL_MS=3500
MINI_APP_URL=$miniApp
TELEGRAM_BOT_USERNAME=$botUsername
TELEGRAM_CHANNEL_URL=$channel
TELEGRAM_BOT_URL=$botUrl
PORT=8787
CLIENT_ORIGIN=http://localhost:5173
"@ | Set-Content -Encoding UTF8 .env

Write-Host "" 
Write-Host ".env created successfully." -ForegroundColor Green
Write-Host "Run: npm install" -ForegroundColor Yellow
Write-Host "Then: npm run dev" -ForegroundColor Yellow
