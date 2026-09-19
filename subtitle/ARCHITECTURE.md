# Separate Sinhala Subtitle Bot Architecture

This add-on can run as a completely separate Telegram bot and repository so the current Cine Universe bot remains untouched.

Flow:
1. User sends a movie/series title to the subtitle bot.
2. Subtitle bot searches Supabase subtitle index.
3. Subtitle files are stored/indexed from a dedicated Telegram subtitle channel.
4. Subtitle bot sends the indexed Telegram file to the user.
5. A configured public/request group can also have the new subtitle bot as an admin/member. The same bot can respond to subtitle-search messages there.
6. Notifications are stored in Supabase and delivered by the subtitle bot.

For group usage, the bot should only process subtitle queries in explicitly configured chats, and it must not run a second polling consumer for the existing Cine Universe bot token. This architecture uses a separate bot token, so the existing bot is isolated.
