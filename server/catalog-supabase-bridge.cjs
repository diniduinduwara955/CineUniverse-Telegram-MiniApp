const fs = require('node:fs');
const path = require('node:path');

const originalReadFile = fs.promises.readFile.bind(fs.promises);
const CATALOG_FILE = path.join(process.cwd(), 'server', 'published-catalog.json');
const TV_CATALOG_FILE = path.join(process.cwd(), 'server', 'published-tv-catalog.json');
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

async function fetchRuntimeCatalog(key) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const url = `${SUPABASE_URL}/rest/v1/cine_runtime_state?key=eq.${encodeURIComponent(key)}&select=payload&limit=1`;
  const response = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
  if (!response.ok) throw new Error(`Supabase ${key} HTTP ${response.status}`);
  const rows = await response.json();
  return rows?.[0]?.payload ?? null;
}

fs.promises.readFile = async function(file, options) {
  const target = path.resolve(String(file));
  const key = target === path.resolve(CATALOG_FILE) ? 'movieCatalog' : target === path.resolve(TV_CATALOG_FILE) ? 'tvCatalog' : null;
  if (key) {
    try {
      const payload = await fetchRuntimeCatalog(key);
      if (payload && typeof payload === 'object') {
        const text = JSON.stringify(payload);
        return typeof options === 'string' || options?.encoding ? text : Buffer.from(text);
      }
    } catch (error) {
      console.warn(`[catalog-bridge] ${key} Supabase read failed; using local file:`, error.message || error);
    }
  }
  return originalReadFile(file, options);
};

console.log('[catalog-bridge] Supabase catalog bridge loaded.');
