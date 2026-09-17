// Cine Universe Render entrypoint.
// Use the unified production bootstrap so the frontend, API proxy, Telegram listener,
// Supabase runtime restore, and existing backend all start in one process.
// The Live Content updater is additive and does not create another getUpdates consumer.
await import('./unified-start-v2.mjs');
await import('./server/live-content-database.js');
