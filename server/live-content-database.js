import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

const LIVE_CHANNEL_ID = String(process.env.LIVE_CONTENT_CHANNEL_CHAT_ID || '-1003965046804').trim();

// The existing Cine Universe backend stores its live catalogs under /server.
// Root-level catalogs are kept only as a safe fallback for deployments that
// have the seed catalog but have not yet created the runtime /server files.
const CATALOG_FILES = [
  path.join(process.cwd(), 'server', 'published-catalog.json'),
  path.join(process.cwd(), 'published-catalog.json')
];
const TV_CATALOG_FILES = [
  path.join(process.cwd(), 'server', 'published-tv-catalog.json'),
  path.join(process.cwd(), 'published-tv-catalog.json')
];
const MESSAGE_FILE = path.join(process.cwd(), 'server', 'live-content-message.json');
const REFRESH_MS = Number(process.env.LIVE_CONTENT_REFRESH_MS || 15000);
const BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();

const INDIAN_LANGUAGES = new Set(['hi','ta','te','ml','kn','bn','mr','gu','pa','ur','or','as']);

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

function itemsFromCatalog(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

async function readCatalog(candidates) {
  for (const file of candidates) {
    const value = await readJson(file);
    const items = itemsFromCatalog(value);
    if (items.length > 0) return items;
  }
  return [];
}

function text(value) {
  return String(value ?? '').trim().toLowerCase();
}

function languagesOf(item) {
  return [
    item?.originalLanguage,
    item?.original_language,
    item?.language,
    item?.spokenLanguage,
    item?.spoken_language,
    ...(Array.isArray(item?.languages) ? item.languages : []),
    ...(Array.isArray(item?.spoken_languages) ? item.spoken_languages.map(x => typeof x === 'object' ? x?.iso_639_1 || x?.name : x) : [])
  ].filter(Boolean).map(text);
}

function genresOf(item) {
  const values = [
    ...(Array.isArray(item?.genres) ? item.genres : []),
    ...(Array.isArray(item?.genre) ? item.genre : []),
    ...(Array.isArray(item?.genre_names) ? item.genre_names : [])
  ];
  return values.map(x => typeof x === 'object' ? x?.name : x).filter(Boolean).map(text);
}

function countriesOf(item) {
  const values = [
    ...(Array.isArray(item?.production_countries) ? item.production_countries : []),
    ...(Array.isArray(item?.productionCountries) ? item.productionCountries : []),
    ...(Array.isArray(item?.countries) ? item.countries : []),
    item?.country,
    item?.origin_country,
    ...(Array.isArray(item?.origin_country) ? item.origin_country : []),
    item?.originalCountry,
    item?.originCountry,
    item?.countryCode
  ];
  return values.flatMap(x => Array.isArray(x) ? x : [x])
    .map(x => typeof x === 'object' ? x?.iso_3166_1 || x?.name : x)
    .filter(Boolean)
    .map(text);
}

function isIndian(item) {
  const langs = languagesOf(item);
  const countries = countriesOf(item);
  return langs.some(x => INDIAN_LANGUAGES.has(x) || x.includes('india'))
    || countries.some(x => x === 'in' || x.includes('india'));
}

function isKorean(item) {
  const langs = languagesOf(item);
  const countries = countriesOf(item);
  return langs.some(x => x === 'ko' || x.includes('korean'))
    || countries.some(x => x === 'kr' || x === 'south korea' || x.includes('korea'));
}

function isAnimation(item) {
  return genresOf(item).some(x => x === 'animation' || x.includes('animation'));
}

function isAnime(item) {
  const langs = languagesOf(item);
  const countries = countriesOf(item);
  const title = text(item?.title || item?.name || item?.original_title || item?.original_name);
  return isAnimation(item) && (
    langs.includes('ja') ||
    countries.some(x => x === 'jp' || x.includes('japan')) ||
    title.includes('anime')
  );
}

function countData(movies, series) {
  const all = [...movies, ...series];
  return {
    movies: movies.length,
    series: series.length,
    indian: all.filter(isIndian).length,
    korean: all.filter(isKorean).length,
    animation: all.filter(isAnimation).length,
    anime: all.filter(isAnime).length,
    total: all.length
  };
}

function latestCatalogUpdate(movies, series) {
  const dates = [...movies, ...series]
    .map(item => item?.updatedAt)
    .map(value => value ? new Date(value) : null)
    .filter(date => date && Number.isFinite(date.getTime()));
  if (!dates.length) return new Date();
  return new Date(Math.max(...dates.map(date => date.getTime())));
}

function formatUpdated(date = new Date()) {
  return new Intl.DateTimeFormat('en-LK', {
    timeZone: 'Asia/Colombo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(date).replace(',', '');
}

function buildMessage(counts, lastUpdated) {
  return `🎬 𝗖𝗜𝗡𝗘 𝗨𝗡𝗜𝗩𝗘𝗥𝗦𝗘™
━━━━━━━━━━━━━━━━━━━━

📊 𝗟𝗜𝗩𝗘 𝗖𝗢𝗡𝗧𝗘𝗡𝗧 𝗗𝗔𝗧𝗔𝗕𝗔𝗦𝗘

🎬 𝗠𝗢𝗩𝗜𝗘𝗦
└─ 🎞 ${counts.movies} Titles

📺 𝗧𝗩 𝗦𝗘𝗥𝗜𝗘𝗦
└─ 📺 ${counts.series} Titles

🇮🇳 𝗜𝗡𝗗𝗜𝗔𝗡
└─ 🎥 ${counts.indian} Titles

🇰🇷 𝗞𝗢𝗥𝗘𝗔𝗡
└─ 🎬 ${counts.korean} Titles

🎨 𝗔𝗡𝗜𝗠𝗔𝗧𝗜𝗢𝗡
└─ ✨ ${counts.animation} Titles

🍥 𝗔𝗡𝗜𝗠𝗘
└─ ⚡ ${counts.anime} Titles

━━━━━━━━━━━━━━━━━━━━

💎 𝗧𝗢𝗧𝗔𝗟 𝗖𝗢𝗡𝗧𝗘𝗡𝗧
🎬 ${counts.total} Titles

🟢 𝗗𝗔𝗧𝗔𝗕𝗔𝗦𝗘
𝗟𝗜𝗩𝗘 • 𝗔𝗖𝗧𝗜𝗩𝗘 • 𝗨𝗣𝗗𝗔𝗧𝗜𝗡𝗚

🕐 𝗟𝗔𝗦𝗧 𝗨𝗣𝗗𝗔𝗧𝗘𝗗
${formatUpdated(lastUpdated)}

━━━━━━━━━━━━━━━━━━━━

🚀 𝗡𝗘𝗪 𝗖𝗢𝗡𝗧𝗘𝗡𝗧
𝗔𝗗𝗗𝗘𝗗 𝗥𝗘𝗚𝗨𝗟𝗔𝗥𝗟𝗬

🎬 Movies • 📺 Series
🇮🇳 Indian • 🇰🇷 Korean
🎨 Animation • 🍥 Anime

❤️ 𝗦𝗧𝗔𝗬 𝗧𝗨𝗡𝗘𝗗
Your next movie is waiting... 🍿

━━━━━━━━━━━━━━━━━━━━

© 𝟮𝟬𝟮𝟲 𝗖𝗶𝗻𝗲 𝗨𝗻𝗶𝘃𝗲𝗿𝘀𝗲™
𝗔𝗹𝗹 𝗥𝗶𝗴𝗵𝘁𝘀 𝗥𝗲𝗦𝗘𝗥𝗩𝗘𝗗.`;
}

async function telegram(method, payload) {
  if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is not configured.');
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data?.description || `Telegram HTTP ${response.status}`);
  return data.result;
}

async function loadMessageId() {
  try {
    const value = JSON.parse(await fs.readFile(MESSAGE_FILE, 'utf8'));
    return Number(value?.message_id) || null;
  } catch {
    return null;
  }
}

async function saveMessageId(messageId) {
  await fs.writeFile(MESSAGE_FILE, JSON.stringify({ message_id: Number(messageId) }, null, 2), 'utf8');
}

async function refreshLiveMessage() {
  if (!BOT_TOKEN || !LIVE_CHANNEL_ID) return;

  // Read the same catalog files used by the existing Cine Universe backend.
  // Nothing in the existing movie/TV upload flow is modified here.
  const movies = await readCatalog(CATALOG_FILES);
  const series = await readCatalog(TV_CATALOG_FILES);
  const counts = countData(movies, series);
  const lastUpdated = latestCatalogUpdate(movies, series);
  const message = buildMessage(counts, lastUpdated);
  let messageId = await loadMessageId();

  console.log(`[live-content] Database counts: movies=${counts.movies}, series=${counts.series}, total=${counts.total}`);

  if (messageId) {
    try {
      await telegram('editMessageText', {
        chat_id: LIVE_CHANNEL_ID,
        message_id: messageId,
        text: message,
        parse_mode: 'HTML'
      });
      return;
    } catch (error) {
      // Telegram returns this when the database values have not changed.
      // It is a successful no-op; do NOT create another message.
      if (/message is not modified/i.test(String(error?.message || error))) return;

      console.warn('[live-content] Existing message could not be edited; creating a new one:', error.message || error);
      messageId = null;
    }
  }

  const sent = await telegram('sendMessage', {
    chat_id: LIVE_CHANNEL_ID,
    text: message,
    parse_mode: 'HTML'
  });
  await saveMessageId(sent.message_id);
  console.log(`[live-content] Live database message created: ${sent.message_id}`);
}

export function startLiveContentDatabase() {
  if (!BOT_TOKEN) {
    console.warn('[live-content] Disabled: TELEGRAM_BOT_TOKEN is not configured.');
    return;
  }
  console.log(`[live-content] Channel: ${LIVE_CHANNEL_ID}`);
  refreshLiveMessage().catch(error => console.error('[live-content] Initial update failed:', error.message || error));
  setInterval(() => {
    refreshLiveMessage().catch(error => console.error('[live-content] Update failed:', error.message || error));
  }, REFRESH_MS);
}

startLiveContentDatabase();
