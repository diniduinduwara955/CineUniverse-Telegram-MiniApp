import os
MAX_FILE_SIZE = 3900 * 1024 * 1024
BOT_TOKEN = os.environ.get("UPLOADER_BOT_TOKEN", os.environ.get("TELEGRAM_BOT_TOKEN", ""))
API_ID = int(os.environ.get("UPLOADER_API_ID", "0") or 0)
API_HASH = os.environ.get("UPLOADER_API_HASH", "")
ASSISTANT_SESSION = os.environ.get("UPLOADER_SESSION", "")
DOWNLOAD_LOCATION = os.environ.get("UPLOADER_DOWNLOAD_LOCATION", "./uploader_downloads")
OWNER_ID = int(os.environ.get("UPLOADER_OWNER_ID", "0") or 0)
