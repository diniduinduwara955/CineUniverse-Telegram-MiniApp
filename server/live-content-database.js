import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

const LIVE_CHANNEL_ID = String(process.env.LIVE_CONTENT_CHANNEL_CHAT_ID || '-1003965046804').trim();
const BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const REFRESH_MS = Number(process.env.LIVE_CONTENT_REFRESH_MS || 15000);
const MESSAGE_FILE = path.join(process.cwd(), 'server', 'live-content-message.json');
const MOVIE_FILE = path.join(process.cwd(), 'server', 'published-catalog.json');
const TV_FILE = path.join(process.cwd(), 'server', 'published-tv-catalog.json');
const LIVE_MARKER = '𝗟𝗜𝗩𝗘 𝗖𝗢𝗡𝗧𝗘𝗡𝗧 𝗗𝗔𝗧𝗔𝗕𝗔𝗦𝗘';
const INDIAN_LANGUAGES = new Set(['hi','ta','te','ml','kn','bn','mr','gu','pa','ur','or','as']);

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
function languages(item) {
  return [item?.originalLanguage,item?.original_language,item?.language,item?.spokenLanguage,item?.spoken_language,
    ...(Array.isArray(item?.languages) ? item.languages : []),
    ...(Array.isArray(item?.spoken_languages) ? item.spoken_languages.map(x => typeof x === 'object' ? x?.iso_639_1 || x?.name : x) : [])].filter(Boolean).map(text);
}
function countries(item) {
  const raw = [item?.country,item?.origin_country,item?.originalCountry,item?.originCountry,item?.countryCode,
    ...(Array.isArray(item?.countries) ? item.countries : []),
    ...(Array.isArray(item?.production_countries) ? item.production_countries : []),
    ...(Array.isArray(item?.productionCountries) ? item.productionCountries : [])];
  return raw.flatMap(x => Array.isArray(x) ? x : [x]).map(x => typeof x === 'object' ? x?.iso_3166_1 || x?.name : x).filter(Boolean).map(text);
}
function genres(item) {
  return [...(Array.isArray(item?.genres) ? item.genres : []),...(Array.isArray(item?.genre) ? item.genre : []),...(Array.isArray(item?.genre_names) ? item.genre_names : [])]
    .map(x => typeof x === 'object' ? x?.name : x).filter(Boolean).map(text);
}
function isIndian(item) { return languages(item).some(x => INDIAN_LANGUAGES.has(x) || x.includes('india')) || countries(item).some(x => x === 'in' || x.includes('india')); }
function isKorean(item) { return languages(item).some(x => x === 'ko' || x.includes('korean')) || countries(item).some(x => x === 'kr' || x.includes('korea')); }
function isAnimation(item) { return genres(item).some(x => x === 'animation' || x.includes('animation')); }
function isAnime(item) {
  const title = text(item?.title || item?.name || item?.original_title || item?.original_name);
  return isAnimation(item) && (languages(item).includes('ja') || countries(item).some(x => x === 'jp' || x.includes('japan')) || title.includes('anime'));
}
function hasCountry(item, codes) {
  const values = countries(item);
  return values.some(value => codes.some(code => value === code || value.includes(code)));
}
function counts(movies, series, downloads) {
  const all = [...movies, ...series];
  return {
    movies: movies.length,
    series: series.length,
    total: all.length,
    downloads: downloads.length,
    indian: all.filter(isIndian).length,
    korean: all.filter(isKorean).length,
    animation: all.filter(isAnimation).length,
    anime: all.filter(isAnime).length,
    sriLanka: all.filter(item => hasCountry(item, ['lk','sri lanka','srilanka'])).length,
    usa: all.filter(item => hasCountry(item, ['us','usa','united states'])).length,
    japan: all.filter(item => hasCountry(item, ['jp','japan'])).length,
    china: all.filter(item => hasCountry(item, ['cn','china'])).length,
    uk: all.filter(item => hasCountry(item, ['gb','uk','united kingdom'])).length
  };
}
function lastUpdated(movies, series) {
  const dates = [...movies, ...series].map(x => x?.updatedAt).filter(Boolean).map(x => new Date(x)).filter(x => Number.isFinite(x.getTime()));
  return dates.length ? new Date(Math.max(...dates.map(x => x.getTime()))) : new Date();
}
function formatUpdated(date) {
  return new Intl.DateTimeFormat('en-LK', { timeZone:'Asia/Colombo', year:'numeric', month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false }).format(date);
}
function buildMessage(c, updated) {
  return `╭──────────────────────────────────────╮
│        🎬 <b>𝗖𝗜𝗡𝗘 𝗨𝗡𝗜𝗩𝗘𝗥𝗦𝗘™</b>        │
│          𝗟𝗜𝗩𝗘 𝗖𝗜𝗡𝗘𝗠𝗔 𝗖𝗢𝗥𝗘          │
╰──────────────────────────────────────╯
        📡 <b>${LIVE_MARKER}</b>
      🟢 <b>ONLINE</b> • ⚡ <b>AUTO SYNC</b> • 🔄 <b>LIVE</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎞️ <b>LIBRARY CORE</b>
🎬 Movies: <b>${c.movies}</b>   │   📺 Series: <b>${c.series}</b>   │   💎 Total: <b>${c.total}</b>
📥 Delivery Maps: <b>${c.downloads}</b>   │   🎬 Quality: 4K • 1080P • 720P • 480P
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌍 <b>REGIONAL CINEMA MAP</b>
🇱🇰 Sri Lanka <b>${c.sriLanka}</b>  │  🇮🇳 India <b>${c.indian}</b>  │  🇰🇷 Korea <b>${c.korean}</b>
🇺🇸 USA <b>${c.usa}</b>  │  🇯🇵 Japan <b>${c.japan}</b>  │  🇨🇳 China <b>${c.china}</b>  │  🇬🇧 UK <b>${c.uk}</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎨 <b>CURATED COLLECTIONS</b>
🎨 Animation <b>${c.animation}</b>  │  🍥 Anime <b>${c.anime}</b>  │  🌎 Worldwide Library
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎥 <b>CINEMA PIPELINE</b>
📥 Telegram → 🔎 Detection → 🗂️ Database → 🌐 Mini App → 🎬 Delivery
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛰️ <b>LIVE ENGINE</b>
🟢 Core: ACTIVE  │  ☁️ State: DATABASE  │  📌 Message: PERSISTENT  │  ⚡ Feed: LIVE
🔄 Sync: AUTOMATIC  │  🕐 Last Catalog Sync: <b>${formatUpdated(updated)}</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ <b>LIVE FEED</b>
🎞️ New titles enter automatically  │  📡 Data stays synchronized
🔄 This message updates in place — <b>NO DUPLICATE FEED</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👑 <b>CINE UNIVERSE OFFICIAL</b>  •  🎬 <i>Built for the cinema experience</i>
👤 Founder &amp; Developer: <b>Dinidu Induwara</b>
© 2026 <b>Cine Universe™</b> • All Rights Reserved`;
}
async function telegram(method, payload) {
  if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is not configured.');
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data?.description || `Telegram HTTP ${res.status}`);
  return data.result;
}
async function messageId() {
  const local = await readJson(MESSAGE_FILE);
  if (Number(local?.message_id)) return { messageId:Number(local.message_id), chatId:String(local.chat_id || LIVE_CHANNEL_ID) };
  const remote = await readRuntimeState('liveContentMessage');
  if (remote && Number(remote.message_id)) return { messageId:Number(remote.message_id), chatId:String(remote.chat_id || LIVE_CHANNEL_ID) };
  return null;
}
async function saveMessageId(chatId, id) {
  const payload = { chat_id:String(chatId), message_id:Number(id), updated_at:new Date().toISOString() };
  await fs.writeFile(MESSAGE_FILE, JSON.stringify(payload, null, 2), 'utf8');
  await saveRuntimeState('liveContentMessage', payload);
}
async function getPinnedLiveMessage() {
  try {
    const chat = await telegram('getChat', { chat_id: LIVE_CHANNEL_ID });
    const pinned = chat?.pinned_message;
    const body = String(pinned?.text || pinned?.caption || '');
    if (body.includes(LIVE_MARKER) && Number(pinned?.message_id)) {
      return { chatId:String(LIVE_CHANNEL_ID), messageId:Number(pinned.message_id), kind:pinned?.caption ? 'caption' : 'text' };
    }
  } catch (err) {
    console.warn('[live-content] pinned message lookup failed:', err.message || err);
  }
  return null;
}
async function refresh() {
  if (!BOT_TOKEN || !LIVE_CHANNEL_ID) return;
  const [movies, series, downloadsPayload] = await Promise.all([
    loadCatalog('movieCatalog', MOVIE_FILE),
    loadCatalog('tvCatalog', TV_FILE),
    readRuntimeState('downloads')
  ]);
  const c = counts(movies, series, items(downloadsPayload));
  const message = buildMessage(c, lastUpdated(movies, series));
  console.log(`[live-content] Database counts: movies=${c.movies}, series=${c.series}, downloads=${c.downloads}, total=${c.total}`);

  const saved = await messageId();
  const pinned = await getPinnedLiveMessage();
  const candidates = [];
  if (saved) candidates.push({ ...saved, kind:'text', source:'saved' });
  if (pinned && (!saved || pinned.messageId !== saved.messageId)) candidates.push({ ...pinned, source:'pinned' });

  for (const candidate of candidates) {
    try {
      const method = candidate.kind === 'caption' ? 'editMessageCaption' : 'editMessageText';
      const payload = { chat_id:candidate.chatId, message_id:candidate.messageId, parse_mode:'HTML', disable_web_page_preview:true };
      if (candidate.kind === 'caption') payload.caption = message;
      else payload.text = message;
      await telegram(method, payload);
      await saveMessageId(candidate.chatId, candidate.messageId);
      if (candidate.source === 'pinned') console.log(`[live-content] adopted existing pinned live database message: ${candidate.messageId}`);
      else console.log(`[live-content] updated existing live content message: ${candidate.messageId}`);
      return;
    } catch (err) {
      if (/message is not modified/i.test(String(err?.message || err))) {
        await saveMessageId(candidate.chatId, candidate.messageId);
        return;
      }
      console.warn(`[live-content] edit failed for ${candidate.messageId}:`, err.message || err);
    }
  }

  const sent = await telegram('sendMessage', {chat_id:LIVE_CHANNEL_ID,text:message,parse_mode:'HTML',disable_web_page_preview:true});
  await saveMessageId(LIVE_CHANNEL_ID, sent.message_id);
  try { await telegram('pinChatMessage', {chat_id:LIVE_CHANNEL_ID,message_id:sent.message_id,disable_notification:true}); }
  catch (err) { console.warn('[live-content] pin failed:', err.message || err); }
  console.log(`[live-content] Live database message created: ${sent.message_id}`);
}
export function startLiveContentDatabase() {
  if (!BOT_TOKEN) { console.warn('[live-content] Disabled: TELEGRAM_BOT_TOKEN is not configured.'); return; }
  console.log(`[live-content] Channel: ${LIVE_CHANNEL_ID}`);
  refresh().catch(err => console.error('[live-content] Initial update failed:', err.message || err));
  setInterval(() => refresh().catch(err => console.error('[live-content] Update failed:', err.message || err)), REFRESH_MS);
}
startLiveContentDatabase();
