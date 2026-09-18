import asyncio
import os
import shutil
import time
from pathlib import Path

import aiohttp
from pyrogram import Client, filters
from pyrogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from config import BOT_TOKEN, API_ID, API_HASH, ASSISTANT_SESSION, DOWNLOAD_LOCATION, MAX_FILE_SIZE

DOWNLOAD_ROOT = Path(DOWNLOAD_LOCATION)
DOWNLOAD_ROOT.mkdir(parents=True, exist_ok=True)

bot = Client("cine_universe_3900mb_bot", api_id=API_ID, api_hash=API_HASH, bot_token=BOT_TOKEN)
assistant = Client("cine_universe_3900mb_assistant", api_id=API_ID, api_hash=API_HASH, session_string=ASSISTANT_SESSION)


def humanbytes(n):
    if not n:
        return "Unknown"
    v = float(n)
    for u in ("B", "KB", "MB", "GB", "TB"):
        if v < 1024 or u == "TB":
            return f"{v:.2f} {u}"
        v /= 1024
    return "Unknown"


async def progress(message, label, current, total, started):
    elapsed = max(time.time() - started, 0.01)
    speed = current / elapsed
    pct = (current * 100 / total) if total else 0
    eta = int((total - current) / speed) if total and speed else 0
    try:
        await message.edit_text(
            f"{label}\n\n"
            f"┏━━━━✦[{('▣' * int(pct // 10)).ljust(10, '▢')}]✦━━━━\n"
            f"┃ 📦 Progress : {pct:.2f}%\n"
            f"┃ ✅ Done    : {humanbytes(current)}\n"
            f"┃ 📁 Total   : {humanbytes(total)}\n"
            f"┃ 🚀 Speed   : {humanbytes(int(speed))}/s\n"
            f"┃ 🕒 ETA     : {eta}s\n"
            f"┗━━━━━━━━━━━━━━━━━━━━━"
        )
    except Exception:
        pass


async def direct_download(url, dest, status):
    timeout = aiohttp.ClientTimeout(total=None, sock_connect=60, sock_read=300)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(url, allow_redirects=True) as response:
            response.raise_for_status()
            total = int(response.headers.get("Content-Length") or 0)
            if total and total > MAX_FILE_SIZE:
                raise ValueError("This file is larger than the 3900 MB limit.")
            started = time.time()
            current = 0
            with open(dest, "wb") as fp:
                while True:
                    chunk = await response.content.read(1024 * 1024)
                    if not chunk:
                        break
                    fp.write(chunk)
                    current += len(chunk)
                    if current > MAX_FILE_SIZE:
                        raise ValueError("Downloaded file exceeded the 3900 MB limit.")
                    if current % (8 * 1024 * 1024) < len(chunk):
                        await progress(status, "📥 Downloading...", current, total, started)
            return current


@bot.on_message(filters.private & filters.command("start"))
async def start_handler(_, m):
    await m.reply_text(
        f"👋 Hello {m.from_user.mention}\n\n"
        "I'm a Telegram URL Uploader Bot.\n"
        "Send a direct link to upload it to Telegram.\n\n"
        "📦 Maximum file size: 3900 MB",
        reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("ℹ️ Help", callback_data="help")]])
    )


@bot.on_message(filters.private & filters.text & ~filters.command("start"))
async def url_handler(_, m):
    text = m.text.strip()
    if not text.startswith(("http://", "https://")):
        return
    parts = text.split("|", 1)
    url = parts[0].strip()
    filename = parts[1].strip() if len(parts) == 2 and parts[1].strip() else Path(url.split("?", 1)[0]).name or "download.bin"
    user_dir = DOWNLOAD_ROOT / str(m.from_user.id)
    user_dir.mkdir(parents=True, exist_ok=True)
    destination = user_dir / filename
    status = await m.reply_text("⏳ Processing your link...")
    try:
        size = await direct_download(url, destination, status)
        await status.edit_text(f"✅ Download complete\n\n📁 {filename}\n📦 {humanbytes(size)}\n\n📤 Uploading...")
        await assistant.send_document(
            chat_id=m.chat.id,
            document=str(destination),
            caption=f"📁 {filename}\n📦 {humanbytes(size)}"
        )
        await status.edit_text("✅ Upload completed successfully.")
    except Exception as exc:
        await status.edit_text(f"❌ Error\n\n{exc}")
    finally:
        shutil.rmtree(user_dir, ignore_errors=True)


async def main():
    await assistant.start()
    await bot.start()
    print("Cine Universe 3900 MB uploader is running")
    await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(main())
