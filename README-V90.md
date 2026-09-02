# Cine Universe V90 — Telegram Message Spacing Add-on

This package is based on V89 and adds a presentation-only Telegram caption layer.

## What changed
- Adds clearer vertical spacing between logical sections in Update Channel captions.
- Adds clean spacing in Public Group request results.
- Applies only to outgoing `sendPhoto` / `sendMessage` captions for the configured Update Channel and Request Group.
- Existing V89 files and logic are preserved; no existing source files were overwritten.

## Run
Use the included `start-v90.bat` after `npm install`, or run the API layer with:

```powershell
node server/v90-server.mjs
```

Run the Vite UI separately with:

```powershell
npx vite
```

The environment variables are read from `.env`:
- `UPDATE_CHANNEL_CHAT_ID`
- `MOVIE_REQUEST_GROUP_CHAT_ID`
