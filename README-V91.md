# Cine Universe V91 — Telegram Message Layout Polish

This is an additive layer on top of V90. Existing `server.js`, UI files, catalog files,
and V83/V87/V88/V89 logic are preserved.

## Telegram presentation
- Update Channel: clearer breathing room between title, IMDb, genres, cast, story and download blocks.
- Public Group: compact spacing between title, IMDb, availability and action lines.
- No content is removed or rewritten; only line spacing is adjusted.
- Default chat IDs match the currently configured project channels, while `.env` values still override them.

## Run
1. `npm install`
2. Run `start-v91.bat`

Or:
- API: `node server/v91-server.mjs`
- UI: `npx vite`
