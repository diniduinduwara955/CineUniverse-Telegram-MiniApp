import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const STATE_TABLE = 'cine_runtime_state';
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const FILES = {
  movieCatalog: 'server/published-catalog.json',
  tvCatalog: 'server/published-tv-catalog.json',
  downloads: 'server/downloads.json',
  expiryJobs: 'server/file-expiry-jobs.json',
  telegramOffset: 'server/telegram-offset.json'
};

const filePath = name => path.join(ROOT, FILES[name]);

async function readJson(name, fallback) {
  try { return JSON.parse(await fs.readFile(filePath(name), 'utf8')); }
  catch { return fallback; }
}

async function writeJson(name, value) {
  await fs.writeFile(filePath(name), JSON.stringify(value, null, 2), 'utf8');
}

async function request(method, body, query = '') {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase environment is not configured.');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${STATE_TABLE}${query}`, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
      Prefer: 'return=minimal,resolution=merge-duplicates'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Supabase HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res;
}

async function getState(key) {
  const res = await request('GET', undefined, `?key=eq.${encodeURIComponent(key)}&select=key,payload&limit=1`);
  const rows = await res.json();
  return rows?.[0]?.payload;
}

async function putState(key, payload) {
  await request('POST', [{ key, payload, updated_at: new Date().toISOString() }]);
}

export async function startSupabaseRuntimeSync() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('[supabase-sync] disabled: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.');
    return;
  }

  try {
    for (const [name] of Object.entries(FILES)) {
      const fallback = name === 'expiryJobs' ? [] : name === 'telegramOffset' ? { offset: 0 } : {};
      const local = await readJson(name, fallback);
      const remote = await getState(name);
      if (remote !== undefined && remote !== null) {
        await writeJson(name, remote);
        console.log(`[supabase-sync] restored ${name}`);
      } else {
        await putState(name, local);
        console.log(`[supabase-sync] seeded ${name}`);
      }
    }

    let last = '';
    const sync = async () => {
      try {
        const values = [];
        for (const name of Object.keys(FILES)) values.push([name, await readJson(name, null)]);
        const snapshot = JSON.stringify(values);
        if (snapshot === last) return;
        for (const [name, payload] of values) await putState(name, payload);
        last = snapshot;
        console.log('[supabase-sync] runtime state synchronized');
      } catch (err) {
        console.warn('[supabase-sync] synchronization failed:', err.message || err);
      }
    };

    await sync();
    const timer = setInterval(sync, 5000);
    timer.unref?.();
    console.log('[supabase-sync] persistent runtime storage active');
  } catch (err) {
    console.error('[supabase-sync] startup restore failed; existing local files kept:', err.message || err);
  }
}
