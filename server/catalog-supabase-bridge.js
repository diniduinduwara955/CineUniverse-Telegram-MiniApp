import fs from 'node:fs/promises';
import path from 'node:path';

const originalReadFile = fs.readFile.bind(fs);
const originalWriteFile = fs.writeFile.bind(fs);
const originalFetch = globalThis.fetch.bind(globalThis);
const CATALOG_FILE = path.join(process.cwd(), 'server', 'published-catalog.json');
const TV_CATALOG_FILE = path.join(process.cwd(), 'server', 'published-tv-catalog.json');
const DOWNLOADS_FILE = path.join(process.cwd(), 'server', 'downloads.json');
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

async function fetchRuntimeCatalog(key) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const url = `${SUPABASE_URL}/rest/v1/cine_runtime_state?key=eq.${encodeURIComponent(key)}&select=payload&limit=1`;
  const response = await originalFetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!response.ok) throw new Error(`Supabase ${key} HTTP ${response.status}`);
  const rows = await response.json();
  return rows?.[0]?.payload ?? null;
}

async function saveRuntimeCatalog(key, payload) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  const url = `${SUPABASE_URL}/rest/v1/cine_runtime_state?on_conflict=key`;
  const response = await originalFetch(url, {
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

// Future FILE NOTICE messages only: keep all existing Telegram messages intact,
// but replace the old notice payload with the new cinematic notice and channel button.
globalThis.fetch = async function(input, init = {}) {
  try {
    const url = String(typeof input === 'string' ? input : input?.url || '');
    const method = String(init?.method || (typeof input !== 'string' ? input?.method || 'GET' : 'GET')).toUpperCase();
    const body = init?.body;

    if (method === 'POST' && /\/sendMessage(?:\?|$)/.test(url) && typeof body === 'string') {
      const payload = JSON.parse(body);
      const oldNotice = String(payload?.text || '');

      if (oldNotice.includes('<b>FILE NOTICE</b>') || oldNotice.includes('ඔයාට ලැබුණු Movie file එක තාවකාලිකයි')) {
        payload.text = [
          '🚨 𝘾𝙄𝙉𝙀 𝙐𝙉𝙄𝙑𝙀𝙍𝙎𝙀 𝘼𝙇𝙀𝙍𝙏',
          '',
          '📥 𝘿𝙊𝙒𝙉𝙇𝙊𝘼𝘿 𝘾𝙊𝙈𝙋𝙇𝙀𝙏𝙀 ✅',
          '',
          '📁 ඔයාගේ File එක ලැබුණා.',
          '',
          '🕒 පැය 48කට පසු Auto Delete වේ.',
          '🔄 නැවත ඕනේ නම් Group එකෙන් Movie එක Request කරන්න.',
          '',
          '⚠️ 𝘾𝙊𝙋𝙔𝙍𝙄𝙂𝙃𝙏',
          'මෙම Content හි සියලුම හිමිකම්',
          'අදාළ Copyright හිමිකරුවන් සතුය.',
          '',
          '💙 𝘾𝙄𝙉𝙀 𝙐𝙉𝙄𝙑𝙀𝙍𝙎𝙀',
          '© 2026 Cine Universe'
        ].join('\n');
        payload.reply_markup = {
          inline_keyboard: [[
            {
              text: '🔥𝐂𝐢𝐧𝐞 𝐔𝐧𝐢𝐯𝐞𝐫𝐬𝐞 | 𝐄𝐧𝐭𝐞𝐫𝐭𝐚𝐢𝐧𝐦𝐞𝐧𝐭 𝐇𝐮𝐛',
              url: 'https://t.me/+xXNo5N_k9aIxMTU9'
            }
          ]]
        };
        return originalFetch(input, { ...init, body: JSON.stringify(payload) });
      }
    }
  } catch (error) {
    // Never let notice styling interfere with normal Telegram/Supabase traffic.
    console.warn('[catalog-bridge] FILE NOTICE style rewrite skipped:', error.message || error);
  }

  return originalFetch(input, init);
};

console.log('[catalog-bridge] Supabase catalog + downloads bridge loaded; local writes + new download sync + future FILE NOTICE style enabled.');
