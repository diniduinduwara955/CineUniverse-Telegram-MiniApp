# Cine Universe Telegram Mini App V26

V26 fixes the current production-flow problems:

- **Channel A → Channel B** remains the source/update pipeline.
- Every successfully matched Channel A movie is saved to a persistent **published catalog**.
- The Mini App now reads `/api/catalog`, shows **Latest Cine Universe Updates**, and supports `?movie=<tmdbId>` deep links.
- The Mini App now has working `/api/downloads/map` and `/api/download` routes. Movie quality buttons use the stored **Channel A message_id** and Telegram `copyMessage` to send the original movie message to the user's bot chat.
- Group movie requests now search **only the published Cine Universe catalog**. A title that has never been published through Channel A → B will not be returned by the request bot.
- TV Series browsing remains available, but Telegram movie file delivery is **movies-only**.
- Existing V25 frontend and styling are retained.

### Environment

`MOVIE_UPLOAD_CHANNEL_CHAT_ID` = Channel A
`UPDATE_CHANNEL_CHAT_ID` = Channel B
`MOVIE_REQUEST_GROUP_CHAT_ID` = your public request group
`TELEGRAM_BOT_TOKEN` = the bot used for all Telegram updates/delivery
`TMDB_API_KEY` = TMDB API key
`MINI_APP_URL` = public Mini App URL (blank is okay for local development)

Run:

```powershell
npm install
npm run dev
```


## V27 Runtime Fix
Fixed the V26 runtime error `normalizeText is not defined` by restoring the shared text-normalization helper used by the TMDB matcher. Server syntax check passed.

# V28 — Poster loading fix only

No UI layout, navigation, Telegram delivery, group-request, A→B channel logic, or quality-mapping behavior was intentionally changed.

Only two poster-loading related changes were made:
1. Home-page API calls now use `Promise.allSettled()` so one failed endpoint does not force the entire page to replace all live TMDB data with demo fallback cards.
2. The Poster component can render either the existing normalized `poster` URL or a raw TMDB `poster_path` as a safety fallback.

# V29 — Poster/API connectivity fix only

Root cause found in V28: the Express server defined the API routes but did not call `app.listen(...)`. The frontend therefore got `ERR_CONNECTION_REFUSED` for `http://localhost:8787/api/...`, which made Home poster data unavailable.

V29 only restores the missing Express listener:
`app.listen(PORT, '0.0.0.0', ...)`

No Telegram A/B logic, group-request logic, quality detection, download/copyMessage logic, frontend layout, or poster component logic was changed.

# V30 — TV Series feature
Only TV-series behavior was added. Existing movie flow remains unchanged.

TV-series uploads:
- Detect common SxxEyy / Season / Episode filenames in Channel A.
- Match the TV series with TMDB.
- Publish poster + rating + genres + cast + overview to Channel B.
- Button to the series' configured private Telegram channel.
- Button to the Mini App (when `MINI_APP_URL` is configured).
- Button to the bot.

Mini App:
- Published TV series are loaded into `tv-catalog`.
- TV details show `Open Private TV Channel` when configured.
- Movie quality download UI remains movie-only.

Group:
- A normal message is matched against the published TV catalog first.
- If found, poster/details + `Open TV Channel` are returned.
- Unpublished TV series are not returned by the TV-specific catalog search.

# V31 — Admin panel TV channel visibility fix

V31 changes only the Admin Panel presentation for TV Series:
- When a TV Series is selected, a visible `Private TV Channel` card appears.
- It contains the invite-link field and `Save TV Channel` button.
- The movie quality mapping panel remains shown only for Movies.
- The backend TV-channel admin route is guaranteed to exist.

Existing movie A→B flow, quality detection, movie Bot delivery, group request behavior, and overall visual system are not intentionally changed.

# V32 — Admin TV panel visibility fix

The TV admin section was present in source but could fail to render because it depended only on a specific `adminSelected.type` shape. V32 makes the condition robust using both `mediaType === "tv"` and `type === "TV Series"`.

The Admin Panel now has explicit branches:
- Movies: existing quality/channel-message mapping UI.
- TV Series: a visible `📺 Private TV Channel` card with invite link + `Save TV Channel`.

No other runtime feature is intentionally changed.

# V33 — Verified Admin TV Channel UI fix

V33 explicitly renders two mutually exclusive Admin Panel branches:
- TV Series: `📺 Private TV Channel` card + invite link + `Save TV Channel`.
- Movie: the existing quality/channel-message mapping form.

The TV UI no longer depends on a fragile nested condition hidden inside the movie form. This is a UI-only admin-panel fix; no Telegram/movie runtime flow is intentionally changed.

# V34 — Admin TV black-screen fix

Root cause found in V33: the Admin Panel JSX referenced `adminTvInviteUrl` / `setAdminTvInviteUrl`, but that React state was not declared. When the Admin UI reached that branch, React could throw a `ReferenceError`, producing the black/blank screen.

V34 only declares that missing state and keeps the TV condition null-safe. No movie flow, TV backend flow, group request logic, download logic, or visual layout was intentionally changed.

# V35 — TV channel save reliability

Fixes the TV Admin Panel save flow:
- Validates the link before sending.
- Shows an explicit `Saving...`, success, or error message.
- Reads the saved value back from the server after saving.
- Loads the previously saved TV channel link when a TV series is selected.
- Adds an admin GET endpoint for the saved TV channel.
- Accepts Telegram `https://t.me/...` links, including private `https://t.me/+...` invites.

No movie delivery or existing A→B movie flow is intentionally changed.

# V36 — TV update reliability only

Based on V35 without changing the existing movie flow.

TV-specific fixes:
- Stronger SxxEyy / Season / Episode detection.
- More robust TV title cleanup and TMDB TV search scoring.
- TV updates are retried on transient Telegram 429/5xx/network failures.
- A TV upload that cannot be matched to TMDB is no longer incorrectly passed into the movie publisher; only non-TV uploads fall through to movie handling.
- TV catalog saves before the Channel B send, so catalog state is not lost if Telegram has a temporary 5xx outage.
- TV group request replies also retry photo delivery on transient Telegram errors.
- Existing private TV channel mapping/button behavior is preserved.

Movie A→B, movie quality detection, movie bot delivery, movie group requests, and existing UI are not intentionally modified.

# V37 — TV Series admin save -> Channel B update

New TV-only behavior:
1. Admin selects a TV Series.
2. Admin saves its private Telegram channel link.
3. The server immediately loads current TMDB TV details.
4. A poster/details update is published to `UPDATE_CHANNEL_CHAT_ID`.
5. The post includes `Open TV Channel`, `Open in Mini App` (when configured), and `Open Bot`.
6. The private channel mapping is saved even if Telegram temporarily fails; the UI reports the publish status.

Existing movie flow and the existing TV episode listener/group-search behavior are preserved.

# V38 — Admin key runtime fix

V37's TV channel save endpoint called `requireAdmin(...)`, but that helper was missing from `server/server.js`, causing:
`requireAdmin is not defined`.

V38 adds only the missing admin-key validator. It checks the `x-admin-key` header against `process.env.ADMIN_KEY` and returns a clear 401/500 response when invalid or unconfigured.

# V39 — Group movie search fix only

Fixed the Movie group-request resolver. Previously it always returned the top catalog row even when the requested title did not match strongly enough, which could make different movie searches return the same movie.

V39 now:
- Scores exact title matches highest.
- Requires strong token/title matching.
- Uses the requested year when provided.
- Rejects unrelated low-score results instead of returning an arbitrary movie.

Only `server/server.js` movie group-search logic was changed. Existing TV group search and all other Movie/TV flows are preserved.


## V40 Detail Popup UI Update
- Cinematic neon + liquid-glass detail modal
- Real TMDB cast profile images and character names
- YouTube-style trailer action and share button
- Existing movie download, TV private channel, admin, Telegram and search logic preserved


# V50
Packaging-only release of the verified V49 popup UI changes. Root folder renamed to V50. Application files and logic are unchanged.


# V51
Actual popup markup + popup-only CSS redesign. No backend, Telegram, movie, TV, admin, or search logic changed.


# V55 — Sinhala group no-result response
Adds a polished Sinhala response when a public-group movie/TV request is not found in the published Cine Universe catalog. Existing matching/delivery logic is preserved.


# V56 — Movie series / collection search in group
Base-name searches such as `Avatar` or `Fast and Furious` now show a selection list from the published Cine Universe movie catalog when multiple matching movies exist. Each result is a clickable Telegram button. Selecting a title sends that movie's normal poster/details + quality buttons. Existing exact-title matching and delivery behavior are preserved.


# V57 — Sinhala group welcome
New members in the configured public request group receive a Sinhala welcome message that mentions their Telegram name, includes the Cine Universe logo as the message photo, official links, and the Cine Universe copyright line. Existing movie/TV request handling remains unchanged.


# V58 — Advanced Sinhala welcome
Enhanced the public-group new-member welcome with a branded Sinhala layout, name mention, search examples, collection-search guidance, official links, community rules, logo photo, and copyright. Existing request/search/download/channel logic is preserved.


# V59 — Shorter Sinhala welcome
The V58 welcome message was shortened while keeping the member mention, Cine Universe branding/logo, Sinhala language, search examples, official links, community note, and copyright.


# V60 — More drama on Home
Adds a dedicated `🎭 Popular Drama TV Series` row to the Home page using the existing `/api/discover?genre=Drama&mediaType=tv` endpoint. Existing Home sections, Telegram logic, Movie/TV backend, search, downloads, and admin features are preserved.


# V61 — Copyright on every update post
Movie and TV update captions now end with `© 2026 Cine Universe. All Rights Reserved.`. Because the same movie formatter is reused by group movie replies, those posts receive the same copyright line too. Existing logic is preserved.


# V62 — Poster loading reliability
Posters use the Mini App same-origin API by default (`/api`) and a robust image-source fallback. Added `/api/health` for quick API diagnostics. Existing movie/TV/Telegram/admin logic preserved.


# V63 — Local API proxy fix
Adds the missing Vite `/api` development proxy to the existing API on port 8787. This fixes the V62 same-origin `/api` requests in local development without changing the existing movie, TV, Telegram, admin, or UI logic.


# V64 — Korean Movies & TV section
Adds dedicated 🇰🇷 Korean Movies and 🇰🇷 Korean TV Series rows to the Home page, powered by TMDB discover with `with_origin_country=KR`. Existing Indian sections and all existing Movie/TV/Telegram/Admin logic are preserved.


# V65 — Fix V61 copyright runtime error
Defines the shared copyright caption constant used by movie update formatting. This resolves `copyright_line is not defined` without changing the Korean sections or existing Telegram/movie/TV logic.


# V66 — Richer Telegram update captions
Enhances Movie and TV Series update post captions with stronger branding, release/rating/runtime/language/genre/story/cast details, cleaner separators, and the existing Cine Universe copyright. Publish flow and buttons are unchanged.


# V67 — Quality buttons on movie update posters
Movie update poster messages now place available 4K/1080P/720P/480P quality buttons in a compact two-column layout. Existing delivery callbacks are reused, and only qualities actually mapped in the download catalog are shown. Other update buttons remain unchanged.


# V68 — Bot Sinhala welcome
Adds a dedicated `/start` welcome for private bot chats, with the existing Cine Universe logo, user mention, Sinhala guidance, official channel and Mini App buttons, and copyright. Existing group/channel/search/download logic is preserved.


# V69 — Group reply + user mention
Successful movie/TV group search responses now reply to the user's original message and mention the requesting user. Collection results and not-found responses also keep the same reply/mention behavior. Existing search and delivery logic is preserved.


# V70 — Strict Telegram group matching
Tightens Movie and TV Series group-message matching so unrelated messages no longer resolve to an arbitrary catalog title. Requires strong title-token coverage and year agreement when a year is supplied. Existing replies, mentions, collection search, posters, quality buttons and delivery remain unchanged.


# V71 — Correct TV/Movie popup routing
Fixes detail-card routing by deriving media type from either `mediaType` or the existing `type` field before opening the detail API. TV Series cards such as `The 100` now always open `/api/tv/:id` instead of falling back to the movie route. No backend or Telegram logic changed.


# V72 — Cast image reliability
Fixes TV Series/Movie popup cast image rendering by normalizing TMDB profile paths, adding explicit image sizing/referrer policy, and preserving a clean initials fallback when a profile image is unavailable. Other features and routing are preserved.


# V73 — Cast image proxy
Cast profile images load through the Cine Universe API using TMDB profile paths. Existing cast UI, popup routing, search, Telegram, and other features are preserved.


# V74 — Search progress + 48-hour file expiry
Group search requests now show a temporary Sinhala processing/research message that is removed after the result is handled. Movie files delivered to a user's bot chat receive a Sinhala 48-hour auto-delete warning, and the delivered file is scheduled for deletion after 48 hours with a persisted expiry job so the schedule survives bot restarts. Existing matching/delivery logic is preserved.


# V75 — Message presentation polish
Refines only the V74 group-processing message and the 48-hour file-expiry warning with cleaner Sinhala wording and Cine Universe branding. Existing matching, Telegram delivery, expiry logic, and all other features are unchanged.


# V76 — Movie + TV cast image fix
Hardens the cast-image proxy to accept both TMDB profile paths and TMDB image URLs, then forces popup cast images to render above the fallback layer. This is limited to cast image delivery/rendering; existing popup routing and all other features are preserved.


# V77 — Cast proxy + bold Telegram message polish
Fixes the TMDB cast-image proxy path construction and polishes Movie/TV update captions and the 48-hour file warning so important content is consistently bold. Existing delivery, expiry, search, popup, and other logic is preserved.

# V78 — Stability and packaging fixes
- Removed the duplicate `/api/tv/:id` route so the canonical TV details response is used consistently.
- Preserved the rich cast profile payload used by the Mini App cast-image proxy.
- Refreshed `setup.ps1` to create all required current environment variables instead of the older partial `.env` configuration.
- Added `.env.example` for safe configuration/template use.
- Distribution packages should not include `node_modules`; run `npm install` after extracting the project.


### IMDb metadata
`OMDB_API_KEY` is optional. When configured, the server resolves the real IMDb rating and vote count using the IMDb title ID returned by TMDB. Without it, the app still shows the TMDB rating and the IMDb title link when available.

# V80 — Telegram-only Home catalog
Home page posters/cards now use only `published-catalog.json` and `published-tv-catalog.json` via `/api/catalog` and `/api/tv-catalog`. TMDB trending/popular/discover data and demo fallback titles are no longer injected into Home sections. Home genre picks are filtered from the published Telegram catalog. Search/admin behavior and prior popup, Poster, IMDb, Cast changes are preserved.
