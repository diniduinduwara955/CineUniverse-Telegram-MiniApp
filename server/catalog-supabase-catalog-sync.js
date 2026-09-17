import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';

const originalFetch = globalThis.fetch.bind(globalThis);
const originalWriteFile = fsPromises.writeFile.bind(fsPromises);

const ROOT = process.cwd();
const MOVIE_CATALOG_FILE = path.join(ROOT, 'server', 'published-catalog.json');
const TV_CATALOG_FILE = path.join(ROOT, 'server', 'published-tv-catalog.json');
const DOWNLOADS_FILE = path.join(ROOT, 'server', 'downloads.json');
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

async function readLocalObject(file) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

async function readRemoteObject(key) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return {};
  const url = `${SUPABASE_URL}/rest/v1/cine_runtime_state?key=eq.${encodeURIComponent(key)}&select=payload&limit=1`;
  const response = await originalFetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    }
  });
  if (!response.ok) throw new Error(`Supabase ${key} HTTP ${response.status}`);
  const rows = await response.json();
  const payload = rows?.[0]?.payload;
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
}

async function writeRemoteObject(key, payload) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  const url = `${SUPABASE_URL}/rest/v1/cine_runtime_state?on_conflict=key`;
  const response = await originalFetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'content-type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify({ key, payload })
  });
  if (!response.ok) throw new Error(`Supabase ${key} HTTP ${response.status}`);
}

async function syncOne(key, file) {
  const local = await readLocalObject(file);
  if (!Object.keys(local).length) return;

  const remote = await readRemoteObject(key);
  const merged = { ...remote, ...local };

  // Additive merge only: records already in Supabase are never deleted.
  await writeRemoteObject(key, merged);
  console.log(`[catalog-sync] ${key}: preserved ${Object.keys(remote).length} existing + synced ${Object.keys(local).length} local records = ${Object.keys(merged).length} total.`);
}

function movieIdFromDownloadKey(key) {
  const match = String(key || '').match(/^movie:(\d+)(?::[^:]+)?$/i);
  return match?.[1] || '';
}

function buildDownloadCatalogEntry(movieId, record) {
  const title = String(record?.title || '').trim();
  if (!movieId || !title) return null;
  return {
    id: Number(movieId),
    tmdbId: Number(movieId),
    title,
    originalTitle: title,
    year: String(record?.year || '').slice(0, 4),
    type: 'Movie',
    mediaType: 'movie',
    poster: String(record?.poster || ''),
    backdrop: String(record?.backdrop || ''),
    overview: String(record?.overview || ''),
    genres: Array.isArray(record?.genres) ? record.genres : [],
    cast: Array.isArray(record?.cast) ? record.cast : [],
    downloadsBackfilled: true,
    lastDownloadAt: String(record?.updated_at || '')
  };
}

async function backfillCatalogFromDownloads() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;

  const remoteDownloads = await readRemoteObject('downloads');
  const localDownloads = await readLocalObject(DOWNLOADS_FILE);
  const downloads = { ...remoteDownloads, ...localDownloads };
  if (!Object.keys(downloads).length) return;

  const remoteCatalog = await readRemoteObject('movieCatalog');
  const additions = {};

  for (const [key, record] of Object.entries(downloads)) {
    const movieId = movieIdFromDownloadKey(key);
    if (!movieId || remoteCatalog[movieId] || additions[movieId]) continue;

    const entry = buildDownloadCatalogEntry(movieId, record);
    if (entry) additions[movieId] = entry;
  }

  if (!Object.keys(additions).length) {
    console.log(`[catalog-sync] movieCatalog already covers all ${Object.keys(downloads).length} download records by TMDB ID.`);
    return;
  }

  const mergedCatalog = { ...remoteCatalog, ...additions };
  await writeRemoteObject('movieCatalog', mergedCatalog);
  console.log(`[catalog-sync] movieCatalog backfilled ${Object.keys(additions).length} missing movie IDs from downloads; total ${Object.keys(mergedCatalog).length}. Existing records preserved.`);
}

export async function syncPublishedCatalogs() {
  try {
    await syncOne('movieCatalog', MOVIE_CATALOG_FILE);
  } catch (error) {
    console.warn('[catalog-sync] movie catalog sync failed; local catalog kept:', error.message || error);
  }

  try {
    await syncOne('tvCatalog', TV_CATALOG_FILE);
  } catch (error) {
    console.warn('[catalog-sync] TV catalog sync failed; local catalog kept:', error.message || error);
  }

  try {
    await backfillCatalogFromDownloads();
  } catch (error) {
    console.warn('[catalog-sync] download-to-catalog backfill failed; existing data kept:', error.message || error);
  }
}

// Startup recovery: publish locally available catalog records and backfill any
// missing movie catalog entries from the persistent downloads database.
await syncPublishedCatalogs();

// Every future catalog write is also merged into Supabase. The local write
// always completes first, so a Supabase failure can never block the upload.
fsPromises.writeFile = async function(file, data, options) {
  const result = await originalWriteFile(file, data, options);
  const target = path.resolve(String(file));

  if (target === path.resolve(MOVIE_CATALOG_FILE)) {
    try {
      await syncOne('movieCatalog', MOVIE_CATALOG_FILE);
    } catch (error) {
      console.warn('[catalog-sync] movie write sync failed; local write kept:', error.message || error);
    }
  } else if (target === path.resolve(TV_CATALOG_FILE)) {
    try {
      await syncOne('tvCatalog', TV_CATALOG_FILE);
    } catch (error) {
      console.warn('[catalog-sync] TV write sync failed; local write kept:', error.message || error);
    }
  }

  return result;
};
