import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

const LIVE_CHANNEL_ID = String(process.env.LIVE_CONTENT_CHANNEL_CHAT_ID || '-1003965046804').trim();
const BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const REFRESH_MS = Number(process.env.LIVE_CONTENT_REFRESH_MS || 15000);
const MESSAGE_FILE = path.join(process.cwd(), 'server', 'live-content-messages-v2.json');
const MOVIE_FILE = path.join(process.cwd(), 'server', 'published-catalog.json');
const TV_FILE = path.join(process.cwd(), 'server', 'published-tv-catalog.json');

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; }
}
function items(value) { return Array.isArray(value) ? value : (value && typeof value === 'object' ? Object.values(value) : []); }
async function readLocal(file) { return items(await readJson(file)); }

async function readRuntimeState(key) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const url = `${SUPABASE_URL}/rest/v1/cine_runtime_state?key=eq.${encodeURIComponent(key)}&select=payload&limit=1`;
    const res = await fetch(url, { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } });
    if (!res.ok) throw new Error(`Supabase HTTP ${res.status}`);
    const rows = await res.json();
    return rows?.[0]?.payload ?? null;
  } catch (err) {
    console.warn(`[live-content] Supabase ${key} read failed:`, err.message || err);
    return null;
  }
}
async function saveRuntimeState(key, payload) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const url = `${SUPABASE_URL}/rest/v1/cine_runtime_state?on_conflict=key`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'content-type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({ key, payload })
    });
    if (!res.ok) throw new Error(`Supabase HTTP ${res.status}`);
  } catch (err) {
    console.warn(`[live-content] Supabase ${key} write failed:`, err.message || err);
  }
}
async function loadCatalog(remoteKey, localFile) {
  const remote = await readRuntimeState(remoteKey);
  return Array.isArray(remote) && remote.length > 0 ? remote : readLocal(localFile);
}

function text(v) { return String(v ?? '').trim().toLowerCase(); }
function titleOf(item) { return String(item?.title || item?.name || item?.original_title || item?.original_name || 'Untitled').trim(); }
function updatedDate(item) {
  const value = item?.updatedAt || item?.updated_at || item?.createdAt || item?.created_at || item?.date || item?.addedAt || item?.added_at;
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}
function latest(itemsList, limit = 5) {
  return [...itemsList].sort((a, b) => (updatedDate(b)?.getTime() || 0) - (updatedDate(a)?.getTime() || 0)).slice(0, limit);
}
function qualityOf(item) {
  return text(item?.quality || item?.resolution || item?.videoQuality || item?.video_quality || item?.label || item?.name || item?.caption);
}
function qualityCounts(downloads) {
  const result = { '4K / UHD': 0, '1080P': 0, '720P': 0, '480P': 0 };
  for (const item of downloads) {
    const q = qualityOf(item).replace(/\s+/g, '');
    if (q.includes('4k') || q.includes('2160')) result['4K / UHD']++;
    else if (q.includes('1080')) result['1080P']++;
    else if (q.includes('720')) result['720P']++;
    else if (q.includes('480')) result['480P']++;
  }
  return result;
}
function formatDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-LK', { timeZone: 'Asia/Colombo', year: 'numeric', month: 'long', day: '2-digit' }).format(date);
}
function formatTime(date = new Date()) {
  return new Intl.DateTimeFormat('en-LK', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).format(date);
}
function stamp(date = new Date()) {
  return `📅 𝗗𝗮𝘁𝗲  ·  ${formatDate(date)}\n⏰ 𝗧𝗶𝗺𝗲  ·  ${formatTime(date)} 🇱🇰`;
}
function latestLines(list) {
  return latest(list).map((item, index) => `${String(index + 1).padStart(2, '0')}  •  𝗠𝗔𝗜𝗡  •  ${titleOf(item)}`).join('\n') || '— 𝗡𝗼 𝗻𝗲𝘄 𝗰𝗼𝗻𝘁𝗲𝗻𝘁 —';
}
function buildMovies(movies, now) {
  return `🎬 𝗖𝗜𝗡𝗘 𝗨𝗡𝗜𝗩𝗘𝗥𝗦𝗘\n        𝙇𝙄𝙑𝙀 𝙈𝙊𝙑𝙄𝙀 𝘿𝘼𝙏𝘼𝘽𝘼𝙎𝙀\n\n━━━━━━━━━━━━━━━━━━━━\n\n🎞️ 𝙈𝙊𝙑𝙄𝙀𝙎\n\n𝗧𝗢𝗧𝗔𝗟 𝗠𝗢𝗩𝗜𝗘𝗦  ·  𝟬${movies.length}\n\n✦ 𝙇𝘼𝙏𝙀𝙎𝙏 𝘼𝘿𝘿𝙀𝘿\n\n${latestLines(movies)}\n\n━━━━━━━━━━━━━━━━━━━━\n\n🟢 𝗗𝗔𝗧𝗔𝗕𝗔𝗦𝗘  ·  𝗟𝗜𝗩𝗘\n🔄 𝘼𝙐𝙏𝙊 𝙐𝙋𝘿𝘼𝙏𝙀  ·  𝗘𝗡𝗔𝗕𝗟𝗘𝗗\n\n🕒 𝙇𝘼𝙎𝙏 𝙐𝙋𝘿𝘼𝙏𝙀𝘿\n${stamp(now)}\n\n💙 𝘾𝙄𝙉𝙀 𝙐𝙉𝙄𝙑𝙀𝙍𝙎𝙀\n© 𝟮𝟬𝟮𝟲 𝗖𝗶𝗻𝗲 𝗨𝗻𝗶𝘃𝗲𝗿𝘀𝗲`;
}
function buildSeries(series, now) {
  return `📺 𝗖𝗜𝗡𝗘 𝗨𝗡𝗜𝗩𝗘𝗥𝗦𝗘\n        𝙇𝙄𝙑𝙀 𝙎𝙀𝙍𝙄𝙀𝙎 𝘿𝘼𝙏𝘼𝘽𝘼𝙎𝙀\n\n━━━━━━━━━━━━━━━━━━━━\n\n📺 𝙏𝙑 𝙎𝙀𝙍𝙄𝙀𝙎\n\n𝗧𝗢𝗧𝗔𝗟 𝗦𝗘𝗥𝗜𝗘𝗦  ·  𝟬${series.length}\n\n✦ 𝙇𝘼𝙏𝙀𝙎𝙏 𝘼𝘿𝘿𝙀𝘿\n\n${latestLines(series)}\n\n━━━━━━━━━━━━━━━━━━━━\n\n🟢 𝗗𝗔𝗧𝗔𝗕𝗔𝗦𝗘  ·  𝗟𝗜𝗩𝗘\n🔄 𝘼𝙐𝙏𝙊 𝙐𝙋𝘿𝘼𝙏𝙀  ·  𝗘𝗡𝗔𝗕𝗟𝗘𝗗\n\n🕒 𝙇𝘼𝙎𝙏 𝙐𝙋𝘿𝘼𝙏𝙀𝘿\n${stamp(now)}\n\n💙 𝘾𝙄𝙉𝙀 𝙐𝙉𝙄𝙑𝙀𝙍𝙎𝙀\n© 𝟮𝟬𝟮𝟲 𝗖𝗶𝗻𝗲 𝗨𝗻𝗶𝘃𝗲𝗿𝘀𝗲`;
}
function buildDownloads(downloads, now) {
  const q = qualityCounts(downloads);
  return `📥 𝗖𝗜𝗡𝗘 𝗨𝗡𝗜𝗩𝗘𝗥𝗦𝗘\n        𝙇𝙄𝙑𝙀 𝘿𝙊𝙒𝙉𝙇𝙊𝘼𝘿 𝘿𝘼𝙏𝘼𝘽𝘼𝙎𝙀\n\n━━━━━━━━━━━━━━━━━━━━\n\n📥 𝙁𝙄𝙇𝙀 𝙎𝙏𝘼𝙏𝙎\n\n💎 𝟰𝗞 / 𝗨𝗛𝗗   ·  ${String(q['4K / UHD']).padStart(3, '0')}\n🔥 𝟭𝟬𝟴𝟬𝗣      ·  ${String(q['1080P']).padStart(3, '0')}\n⚡ 𝟳𝟮𝟬𝗣       ·  ${String(q['720P']).padStart(3, '0')}\n📱 𝟰𝟴𝟬𝗣       ·  ${String(q['480P']).padStart(3, '0')}\n\n𝗧𝗢𝗧𝗔𝗟 𝗙𝗜𝗟𝗘𝗦  ·  ${downloads.length}\n\n━━━━━━━━━━━━━━━━━━━━\n\n🟢 𝗗𝗔𝗧𝗔𝗕𝗔𝗦𝗘  ·  𝗟𝗜𝗩𝗘\n🔄 𝘼𝙐𝙏𝙊 𝙐𝙋𝘿𝘼𝙏𝙀  ·  𝗘𝗡𝗔𝗕𝗟𝗘𝗗\n\n🕒 𝙇𝘼𝙎𝙏 𝙐𝙋𝘿𝘼𝙏𝙀𝘿\n${stamp(now)}\n\n💙 𝘾𝙄𝙉𝙀 𝙐𝙉𝙄𝙑𝙀𝙍𝙎𝙀\n© 𝟮𝟬𝟮𝟲 𝗖𝗶𝗻𝗲 𝗨𝗻𝗶𝘃𝗲𝗿𝘀𝗲`;
}
function buildOverall(movies, series, downloads, now) {
  const total = movies.length + series.length;
  return `🌐 𝗖𝗜𝗡𝗘 𝗨𝗡𝗜𝗩𝗘𝗥𝗦𝗘\n        𝙇𝙄𝙑𝙀 𝘾𝙊𝙉𝙏𝙀𝙉𝙏 𝙎𝙏𝘼𝙏𝙐𝙎\n\n━━━━━━━━━━━━━━━━━━━━\n\n🎬 𝗠𝗢𝗩𝗜𝗘𝗦       ·  ${movies.length}\n📺 𝗧𝗩 𝗦𝗘𝗥𝗜𝗘𝗦    ·  ${series.length}\n📥 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗦   ·  ${downloads.length}\n\n𝗧𝗢𝗧𝗔𝗟 𝗧𝗜𝗧𝗟𝗘𝗦  ·  ${total}\n\n━━━━━━━━━━━━━━━━━━━━\n\n🟢 𝗦𝗬𝗦𝗧𝗘𝗠  ·  𝗢𝗡𝗟𝗜𝗡𝗘\n🔄 𝗔𝗨𝗧𝗢 𝗦𝗬𝗡𝗖  ·  𝗘𝗡𝗔𝗕𝗟𝗘𝗗\n⚡ 𝗙𝗘𝗘𝗗      ·  𝗟𝗜𝗩𝗘\n📌 𝗠𝗘𝗦𝗦𝗔𝗚𝗘𝗦   ·  𝟬𝟰 𝗣𝗘𝗥𝗦𝗜𝗦𝗧𝗘𝗡𝗧\n\n━━━━━━━━━━━━━━━━━━━━\n\n🕒 𝙇𝘼𝙎𝙏 𝙐𝙋𝘿𝘼𝙏𝙀𝘿\n${stamp(now)}\n\n💙 𝘾𝙄𝙉𝙀 𝙐𝙉𝙄𝙑𝙀𝙍𝙎𝙀\n© 𝟮𝟬𝟮𝟲 𝗖𝗶𝗻𝗲 𝗨𝗻𝗶𝘃𝗲𝗿𝘀𝗲`;
}

async function telegram(method, payload) {
  if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is not configured.');
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data?.description || `Telegram HTTP ${res.status}`);
  return data.result;
}

async function readMessageIds() {
  const local = await readJson(MESSAGE_FILE);
  if (local?.messages && typeof local.messages === 'object') return local;
  const remote = await readRuntimeState('liveContentMessagesV2');
  if (remote?.messages && typeof remote.messages === 'object') return remote;
  return null;
}
async function saveMessageIds(messages) {
  const payload = { chat_id: LIVE_CHANNEL_ID, messages, updated_at: new Date().toISOString() };
  await fs.writeFile(MESSAGE_FILE, JSON.stringify(payload, null, 2), 'utf8');
  await saveRuntimeState('liveContentMessagesV2', payload);
}

async function editPersistentMessage(id, textValue) {
  try {
    await telegram('editMessageText', { chat_id: LIVE_CHANNEL_ID, message_id: Number(id), text: textValue, parse_mode: 'HTML', disable_web_page_preview: true });
    return true;
  } catch (err) {
    if (/message is not modified/i.test(String(err?.message || err))) return true;
    console.warn(`[live-content] edit failed for ${id}:`, err.message || err);
    return false;
  }
}

async function createInitialMessages(messages) {
  const result = { ...messages };
  const definitions = [
    ['movies', 'movies'],
    ['series', 'series'],
    ['downloads', 'downloads'],
    ['overall', 'overall']
  ];
  for (const [key] of definitions) {
    const sent = await telegram('sendMessage', { chat_id: LIVE_CHANNEL_ID, text: messages[key], parse_mode: 'HTML', disable_web_page_preview: true });
    result[key] = Number(sent.message_id);
    try { await telegram('pinChatMessage', { chat_id: LIVE_CHANNEL_ID, message_id: Number(sent.message_id), disable_notification: true }); } catch {}
  }
  await saveMessageIds(result);
  console.log(`[live-content] Created 4 persistent live database messages in channel ${LIVE_CHANNEL_ID}: ${Object.values(result).join(', ')}`);
}

async function refresh() {
  if (!BOT_TOKEN || !LIVE_CHANNEL_ID) return;
  const [movies, series, downloadsPayload] = await Promise.all([
    loadCatalog('movieCatalog', MOVIE_FILE),
    loadCatalog('tvCatalog', TV_FILE),
    readRuntimeState('downloads')
  ]);
  const downloads = items(downloadsPayload);
  const now = new Date();
  const messages = {
    movies: buildMovies(movies, now),
    series: buildSeries(series, now),
    downloads: buildDownloads(downloads, now),
    overall: buildOverall(movies, series, downloads, now)
  };
  console.log(`[live-content] Database counts: movies=${movies.length}, series=${series.length}, downloads=${downloads.length}, total=${movies.length + series.length}`);

  const saved = await readMessageIds();
  if (!saved?.messages?.movies || !saved?.messages?.series || !saved?.messages?.downloads || !saved?.messages?.overall) {
    await createInitialMessages(messages);
    return;
  }

  const keys = ['movies', 'series', 'downloads', 'overall'];
  let allEdited = true;
  for (const key of keys) {
    const ok = await editPersistentMessage(saved.messages[key], messages[key]);
    if (!ok) allEdited = false;
  }
  if (allEdited) await saveMessageIds(saved.messages);
}

export function startLiveContentDatabase() {
  if (!BOT_TOKEN) { console.warn('[live-content] Disabled: TELEGRAM_BOT_TOKEN is not configured.'); return; }
  console.log(`[live-content] Four-message channel: ${LIVE_CHANNEL_ID}`);
  refresh().catch(err => console.error('[live-content] Initial update failed:', err.message || err));
  setInterval(() => refresh().catch(err => console.error('[live-content] Update failed:', err.message || err)), REFRESH_MS);
}
startLiveContentDatabase();
