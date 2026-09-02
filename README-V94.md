# Cine Universe V94 — Telegram Message Spacing Polish

This is an additive presentation layer on top of the V93 package.

## What changes
- Update Channel: clear blank-line spacing between title, IMDb, genres, cast, story and download blocks.
- Public Group: clear spacing between movie, rating, availability and action lines.
- No changes to existing `server/server.js`, React UI, catalog files, popup logic, IMDb/cast/quality logic, Anime/Country sections, or reliability files.

## Run
```powershell
npm install
.\start-v94.bat
```

Do not use `npm run dev` for this V94-only Telegram presentation layer; `start-v94.bat` launches the original server with the additive V94 loader.
