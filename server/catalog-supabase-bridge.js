import fs from 'node:fs/promises';
import path from 'node:path';

const originalReadFile = fs.readFile.bind(fs);
const originalWriteFile = fs.writeFile.bind(fs);
const CATALOG_FILE = path.join(process.cwd(), 'server', 'published-catalog.json');
const TV_CATALOG_FILE = path.join(process.cwd(), 'server', 'published-tv-catalog.json');
const DOWNLOADS_FILE = path.join(process.cwd(), 'server', 'downloads.json');
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

async function fetchRuntimeCatalog(key) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const url = `${SUPABASE_URL}/rest/v1/cine_runtime_state?key=eq.${encodeURIComponent(key)}&select=payload&limit=1`;
  const response = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!response.ok) throw new Error(`Supabase ${key} HTTP ${response.status}`);
  const rows = await response.json();
  return rows?.[0]?.payload ?? null;
}

async function saveRuntimeCatalog(key, payload) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  const url = `${SUPABASE_URL}/rest/v1/cine_runtime_state?on_conflict=key`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'content-type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ key, payload }),
  });
  if (!response.ok) throw new Error(`Supabase ${key} HTTP ${response.status}`);
}

fs.readFile = async function(file, options) {
  const target = path.resolve(String(file));
  const isMovie = target === path.resolve(CATALOG_FILE);
  const isTv = target === path.resolve(TV_CATALOG_FILE);
  const isDownloads = target === path.resolve(DOWNLOADS_FILE);

  // Keep the existing local-file-first behavior for downloads. In production,
  // the repository does not contain downloads.json, so the Supabase runtime
  // map becomes the fallback source for the group quality buttons.
  if (isDownloads) {
    try {
      const local = await originalReadFile(file, options);
      const localText = typeof local === 'string' ? local : Buffer.from(local).toString('utf8');
      const localMap = JSON.parse(localText);
      if (localMap && typeof localMap === 'object' && Object.keys(localMap).length > 0) return local;
    } catch {}

    try {
      const payload = await fetchRuntimeCatalog('downloads');
      if (payload && typeof payload === 'object' && Object.keys(payload).length > 0) {
        const text = JSON.stringify(payload);
        return typeof options === 'string' || options?.encoding ? text : Buffer.from(text);
      }
    } catch (error) {
      console.warn('[catalog-bridge] Supabase downloads read failed; using local file:', error.message || error);
    }

    return originalReadFile(file, options);
  }

  if (isMovie || isTv) {
    try {
      const payload = await fetchRuntimeCatalog(isMovie ? 'movieCatalog' : 'tvCatalog');
      if (payload && typeof payload === 'object') {
        const text = JSON.stringify(payload);
        return typeof options === 'string' || options?.encoding ? text : Buffer.from(text);
      }
    } catch (error) {
      console.warn(`[catalog-bridge] ${isMovie ? 'movie' : 'TV'} catalog Supabase read failed; using local file:`, error.message || error);
    }
  }

  return originalReadFile(file, options);
};

// Preserve the existing local downloads.json write, then persist the complete
// map to Supabase. Existing entries are kept unchanged because the map is
// written as a whole after the server has merged the new quality record.
fs.writeFile = async function(file, data, options) {
  const result = await originalWriteFile(file, data, options);
  const target = path.resolve(String(file));
  if (target !== path.resolve(DOWNLOADS_FILE)) return result;

  try {
    const localText = typeof data === 'string' ? data : Buffer.from(data).toString('utf8');
    const localMap = JSON.parse(localText);
    if (localMap && typeof localMap === 'object' && Object.keys(localMap).length > 0) {
      await saveRuntimeCatalog('downloads', localMap);
      console.log(`[catalog-bridge] Downloads synced to Supabase: ${Object.keys(localMap).length} records.`);
    }
  } catch (error) {
    console.warn('[catalog-bridge] Supabase downloads sync failed; local write kept:', error.message || error);
  }

  return result;
};

console.log('[catalog-bridge] Supabase catalog + downloads bridge loaded; local writes + new download sync enabled.');
