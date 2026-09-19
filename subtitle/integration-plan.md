# Safe integration plan

The existing unified Telegram polling loop is kept intact.

The subtitle addon is deliberately added first as isolated modules and schema:
- subtitle/parser.js
- subtitle/supabase.js
- subtitle/service.js
- subtitle/indexer.js
- subtitle/messages.js
- subtitle/index.js
- supabase/subtitles.sql

Integration must be done at the existing single update-dispatch point rather than adding a second getUpdates consumer. This avoids Telegram polling conflicts and protects the existing movie/TV workflow.

Before production activation, the adapter should:
1. Inspect an incoming channel_post.
2. Only handle posts whose chat id equals SUBTITLE_CHANNEL_CHAT_ID.
3. Index SRT/ASS/VTT metadata into cine_subtitles.
4. For user messages, only handle subtitle-looking queries that are not consumed by the existing group/movie workflow.
5. For callback queries, use a dedicated callback prefix such as subtitle:...
6. Reuse the existing Telegram sender utilities instead of creating another polling client.

No existing working file is overwritten in this branch.
