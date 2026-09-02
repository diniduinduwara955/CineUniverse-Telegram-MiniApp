# Cine Universe V95 – Telegram Category Poster Fix

This version is based on V94 and targets one issue only: Home Anime / Indian / Korean sections were visible but could be empty because older Telegram-published catalog rows did not carry country/origin metadata.

V95 keeps Telegram-published content as the only Home source, preserves the stored poster/backdrop URLs, and enriches legacy catalog rows from their existing TMDB IDs when `/api/catalog` or `/api/tv-catalog` is requested. The Home filters can then correctly classify matching Telegram-published titles into:

- 🎌 Anime
- 🇮🇳 Indian Movies
- 🇮🇳 Indian TV Series
- 🇰🇷 Korean Movies
- 🇰🇷 Korean TV Series

No TMDB popular/discover content is injected into these Home sections. Existing UI/Popup/IMDb/Cast/Quality/Telegram logic is preserved apart from the targeted category metadata fix.

Run:

```powershell
npm install
npm run dev
```
