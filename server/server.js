// Cine Universe server bridge
// Loads the Supabase catalog bridge before the existing backend so runtime
// movie/TV catalogs are read from Supabase without changing the core server logic.
await import('./catalog-supabase-bridge.js');
await import('./catalog-supabase-catalog-sync.js');
await import('./telegram-fetch-resilience.js');
await import('./telegram-polling-preflight.js');
await import('../server.js');
await import('./live-content-database.js');
