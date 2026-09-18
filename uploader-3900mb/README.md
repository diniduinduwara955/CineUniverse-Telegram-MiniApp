# Cine Universe 3900MB URL Uploader

Standalone Telegram URL uploader based on the workflow of LISA-KOREA/UPLOADER-BOT-V4.

## Target
- URL/direct-link download
- file name override with `URL | File Name.ext`
- format selection
- progress display
- thumbnail/caption support
- large-file upload path through a Telegram user/assistant session
- configured maximum file size: 3900 MB

## Important
Telegram's current official Bot API upload limit is 50 MB; a local Bot API server raises that to 2000 MB. Telegram's MTProto client protocol supports files up to 4 GB. Therefore this 3900 MB target requires a user/assistant MTProto upload session rather than the standard Bot API upload path.

This folder is intentionally separate from the Cine Universe movie catalog and Telegram content pipeline.
