import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const SERVER_DIR = path.join(ROOT, 'server');
const MOVIE_CATALOG = path.join(SERVER_DIR, 'published-catalog.json');
const TV_CATALOG = path.join(SERVER_DIR, 'published-tv-catalog.json');
const CANONICAL_SNAPSHOT = path.join(SERVER_DIR, 'v83-canonical-catalog.json');
const STATE_FILE = path.join(SERVER_DIR, 'v83-reliability-state.json');

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);
const DEDUPE_TTL_MS = Number(process.env.TG_DEDUPE_TTL_MS || 15_000);
const MAX_RETRIES = Number(process.env.TG_RETRY_ATTEMPTS || 3);
const BASE_DELAY_MS = Number(process.env.TG_RETRY_BASE_MS || 700);

const sentCache = new Map();
const inFlight = new Map();

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
function hash(value){ return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

function isTelegramApi(url){
  try { return new URL(url).hostname === 'api.telegram.org'; } catch { return false; }
}

function telegramMethod(url){
  const m = String(url).match(/\/bot[^/]+\/([^?]+)/i);
  return m?.[1] || '';
}

function requestFingerprint(url, init={}){
  let body = init.body;
  if (typeof body === 'string') body = body;
  else if (body && typeof body === 'object' && !(body instanceof Uint8Array)) {
    try { body = JSON.stringify(body); } catch { body = String(body); }
  }
  return hash({ method: telegramMethod(url), body: body || '' });
}

function isSendOperation(method){
  return ['sendMessage','sendPhoto','sendDocument','sendVideo','sendAudio','copyMessage','forwardMessage'].includes(method);
}

function isDuplicateWindow(method, key){
  if (!isSendOperation(method)) return false;
  const now = Date.now();
  const hit = sentCache.get(key);
  if (hit && hit > now) return true;
  sentCache.set(key, now + DEDUPE_TTL_MS);
  for (const [k, expires] of sentCache) if (expires <= now) sentCache.delete(k);
  return false;
}

function installFetchInterceptor(){
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (url, init={}) => {
    if (!isTelegramApi(url)) return originalFetch(url, init);
    const method = telegramMethod(url);
    const key = requestFingerprint(url, init);
    if (isDuplicateWindow(method, key)) {
      console.warn(`[v83] duplicate Telegram ${method} suppressed`);
      return new Response(JSON.stringify({ ok: true, result: { v83_deduped: true } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    const existing = inFlight.get(key);
    if (existing) return existing.then(r => new Response(r.body, { status:r.status, headers:r.headers }));

    const run = (async () => {
      let lastResponse;
      let lastError;
      for (let attempt=0; attempt<=MAX_RETRIES; attempt++) {
        try {
          const response = await originalFetch(url, init);
          lastResponse = response;
          if (response.ok || !RETRYABLE.has(response.status) || attempt === MAX_RETRIES) return response;
        } catch (err) {
          lastError = err;
          if (attempt === MAX_RETRIES) throw err;
        }
        const wait = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[v83] Telegram ${method} retry ${attempt+1}/${MAX_RETRIES} in ${wait}ms`);
        await sleep(wait);
      }
      if (lastError) throw lastError;
      return lastResponse;
    })();
    inFlight.set(key, run);
    try { return await run; }
    finally { inFlight.delete(key); }
  };
}

function mediaFingerprint(item){
  return hash({
    id: item?.id ?? item?.tmdbId ?? null,
    mediaType: item?.mediaType ?? item?.type ?? null,
    title: String(item?.title || item?.name || '').trim().toLowerCase(),
    year: String(item?.year || item?.release_date || item?.first_air_date || '').slice(0,4),
  });
}

function normalizeMapObject(raw){
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return Object.values(raw);
  return [];
}

function canonicalizeCatalog(raw, kind){
  const list = normalizeMapObject(raw);
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const key = mediaFingerprint({ ...item, mediaType: item.mediaType || kind });
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...item, mediaType: item.mediaType || kind });
  }
  out.sort((a,b)=>String(b.updatedAt||b.publishedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.publishedAt||a.createdAt||'')));
  return out;
}

async function readJson(file){
  try { return JSON.parse(await fs.readFile(file,'utf8')); } catch { return {}; }
}

async function syncCanonicalSnapshot(){
  const movies = canonicalizeCatalog(await readJson(MOVIE_CATALOG), 'movie');
  const tv = canonicalizeCatalog(await readJson(TV_CATALOG), 'tv');
  const canonical = {
    version: 1,
    generatedAt: new Date().toISOString(),
    movies,
    tv,
    counts: { movies: movies.length, tv: tv.length },
  };
  await fs.writeFile(CANONICAL_SNAPSHOT, JSON.stringify(canonical,null,2), 'utf8');
  return canonical;
}

async function state(){
  try { return JSON.parse(await fs.readFile(STATE_FILE,'utf8')); } catch { return {}; }
}

export async function startV83Reliability(){
  installFetchInterceptor();
  let snapshot = await syncCanonicalSnapshot();
  await fs.writeFile(STATE_FILE, JSON.stringify({ startedAt:new Date().toISOString(), lastSyncAt:snapshot.generatedAt, counts:snapshot.counts },null,2),'utf8');
  let syncing = false;
  const timer = setInterval(async()=>{
    if (syncing) return;
    syncing = true;
    try {
      const s = await syncCanonicalSnapshot();
      await fs.writeFile(STATE_FILE, JSON.stringify({ lastSyncAt:s.generatedAt, counts:s.counts },null,2),'utf8');
    } catch(err) { console.warn('[v83] catalog sync failed:', err.message || err); }
    finally { syncing = false; }
  }, Number(process.env.CATALOG_SYNC_INTERVAL_MS || 30_000));
  timer.unref?.();
  return { snapshot, timer };
}

export function getV83Paths(){
  return { MOVIE_CATALOG, TV_CATALOG, CANONICAL_SNAPSHOT, STATE_FILE };
}
