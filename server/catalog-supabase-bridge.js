import fs from 'node:fs/promises';
import path from 'node:path';

const originalReadFile = fs.readFile.bind(fs);
const originalWriteFile = fs.writeFile.bind(fs);
const originalFetch = globalThis.fetch.bind(globalThis);
const CATALOG_FILE = path.join(process.cwd(), 'server', 'published-catalog.json');
const TV_CATALOG_FILE = path.join(process.cwd(), 'server', 'published-tv-catalog.json');
const DOWNLOADS_FILE = path.join(process.cwd(), 'server', 'downloads.json');
const LIVE_MESSAGE_FILE = path.join(process.cwd(), 'server', 'live-content-message.json');
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const WELCOME_IMAGE_URL = 'https://raw.githubusercontent.com/diniduinduwara955/CineUniverse-Telegram-MiniApp/main/public/cine-universe-bot-welcome.jpg';

function buildBotWelcomeText(mention) {
  return [
    '🎬 𝘾𝙄𝙉𝙀 𝙐𝙉𝙄𝙑𝙀𝙍𝙎𝙀',
    '',
    `👋 𝐖𝐞𝐥𝐜𝐨𝐦𝐞, ${mention}!`,
    '',
    '🌌 𝙒𝙝𝙚𝙧𝙚 𝙚𝙫𝙚𝙧𝙮 𝙨𝙩𝙤𝙧𝙮',
    '𝙛𝙞𝙣𝙙𝙨 𝙞𝙩𝙨 𝙨𝙘𝙧𝙚𝙚𝙣. ✨',
    '',
    '🎥 𝐌𝐎𝐕𝐈𝐄𝐒',
    '📺 𝐓𝐕 𝐒𝐄𝐑𝐈𝐄𝐒',
    '🔎 𝐒𝐌𝐀𝐑𝐓 𝐒𝐄𝐀𝐑𝐂𝐇',
    '⭐ 𝐈𝐌𝐃𝐁 & 𝐓𝐌𝐃𝐁 𝐑𝐀𝐓𝐈𝐍𝐆𝐒',
    '🎭 𝐆𝐄𝐍𝐑𝐄𝐒 & 𝐂𝐀𝐒𝐓',
    '📝 𝐒𝐓𝐎𝐑𝐘 & 𝐃𝐄𝐓𝐀𝐈𝐋𝐒',
    '📥 𝐀𝐕𝐀𝐈𝐋𝐀𝐁𝐋𝐄 𝐐𝐔𝐀𝐋𝐈𝐓𝐈𝐄𝐒',
    '🎞️ 𝟒𝐊 • 𝟏𝟎𝟖𝟎𝐏 • 𝟕𝟐𝟎𝐏',
    '',
    '🚀 𝐅𝐀𝐒𝐓 𝐃𝐈𝐒𝐂𝐎𝐕𝐄𝐑𝐘',
    '🔍 Movie එකක හෝ Series එකක නම type කරන්න.',
    '🎬 Details → Quality → Available File',
    '',
    '✨ 𝑺𝒆𝒂𝒓𝒄. 𝑫𝒊𝒔𝒄𝒐𝒗𝒆𝒓. 𝑬𝒙𝒑𝒆𝒓𝒊𝒆𝒏𝒄𝒆.',
    '',
    '🍿 𝐅𝐢𝐧𝐝 𝐢𝐭.',
    '🎬 𝐄𝐱𝐩𝐥𝐨𝐫𝐞 𝐢𝐭.',
    '🌌 𝐋𝐢𝐯𝐞 𝐭𝐡𝐞 𝐬𝐭𝐨𝐫𝐲.',
    '',
    '💙 𝘾𝙄𝙉𝙀 𝙐𝙉𝙄𝙑𝙀𝙍𝙎𝙀',
    '𝑪𝒓𝒆𝒂𝒕𝒆𝒅 𝒃𝒚 𝐃𝐢𝐧𝐢𝐝𝐮 𝐈𝐧𝐝𝐮𝐰𝐚𝐫𝐚',
    '',
    '© 2026 𝘾𝙞𝙣𝙚 𝙐𝙣𝙞𝙫𝙚𝙧𝙨𝙚'
  ].join('\n');
}

function buildBotWelcomeKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🎬 𝐂𝐢𝐧𝐞 𝐔𝐧𝐢𝐯𝐞𝐫𝐬𝐞 | 𝐑𝐞𝐪𝐮𝐞𝐬𝐭 𝐇𝐮𝐛', url: 'https://t.me/dinidupitigala2003' }],
      [{ text: '🔥𝐂𝐢𝐧𝐞 𝐔𝐧𝐢𝐯𝐞𝐫𝐬𝐞 | 𝐄𝐧𝐭𝐞𝐫𝐭𝐚𝐢𝐧𝐦𝐞𝐧𝐭 𝐇𝐮𝐛', url: 'https://t.me/dinidu20030304' }]
    ]
  };
}

async function sendBotWelcomeDirect(message) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token || message?.chat?.type !== 'private') return false;

  const user = message?.from || {};
  const display = String(user.first_name || user.username || 'Friend').trim();
  const mention = `<a href="tg://user?id=${Number(user.id)}">${String(display).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}</a>`;
  const payload = {
    chat_id: String(message.chat.id),
    photo: WELCOME_IMAGE_URL,
    caption: buildBotWelcomeText(mention),
    parse_mode: 'HTML',
    reply_markup: buildBotWelcomeKeyboard()
  };

  const response = await originalFetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data?.description || `Telegram HTTP ${response.status}`);
  return true;
}

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

async function getExistingLiveMessage() {
  try {
    const local = JSON.parse(await originalReadFile(LIVE_MESSAGE_FILE, 'utf8'));
    if (Number(local?.message_id)) {
      return {
        chat_id: String(local.chat_id || ''),
        message_id: Number(local.message_id),
      };
    }
  } catch {}

  try {
    const remote = await fetchRuntimeCatalog('liveContentMessage');
    if (remote && Number(remote.message_id)) {
      return {
        chat_id: String(remote.chat_id || ''),
        message_id: Number(remote.message_id),
      };
    }
  } catch {}

  return null;
}

fs.readFile = async function(file, options) {
  const target = path.resolve(String(file));
  const isMovie = target === path.resolve(CATALOG_FILE);
  const isTv = target === path.resolve(TV_CATALOG_FILE);
  const isDownloads = target === path.resolve(DOWNLOADS_FILE);
  const callerStack = String(new Error().stack || '');

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
    const isRequestGroupSearch = callerStack.includes('handleGroupTvRequest') || callerStack.includes('resolveRequestedMovie');

    if (isRequestGroupSearch) {
      try {
        const local = await originalReadFile(file, options);
        const localText = typeof local === 'string' ? local : Buffer.from(local).toString('utf8');
        const localCatalog = JSON.parse(localText);
        if (localCatalog && typeof localCatalog === 'object' && Object.keys(localCatalog).length > 0) {
          return local;
        }
      } catch {}
    }

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

globalThis.fetch = async function(input, init = {}) {
  try {
    const url = String(typeof input === 'string' ? input : input?.url || '');
    const method = String(init?.method || (typeof input !== 'string' ? input?.method || 'GET' : 'GET')).toUpperCase();
    const body = init?.body;
    const callerStack = String(new Error().stack || '');

    if (
      method === 'GET' &&
      /\/rest\/v1\/cine_runtime_state(?:\?|$)/.test(url) &&
      callerStack.includes('live-content-database.js')
    ) {
      const match = url.match(/[?&]key=eq\.(movieCatalog|tvCatalog)(?:&|$)/);
      if (match) {
        const localFile = match[1] === 'movieCatalog' ? CATALOG_FILE : TV_CATALOG_FILE;
        try {
          const localText = await originalReadFile(localFile, 'utf8');
          const localPayload = JSON.parse(localText);
          if (Array.isArray(localPayload)) {
            return new Response(JSON.stringify([{ payload: localPayload }]), {
              status: 200,
              headers: { 'content-type': 'application/json' }
            });
          }
        } catch {}
      }
    }

    if (method === 'POST' && /\/sendPhoto(?:\?|$)/.test(url) && body && typeof body.get === 'function' && typeof body.set === 'function') {
      const oldCaption = String(body.get('caption') || '');
      if (oldCaption.includes('Cine Universe Bot වෙත සාදරයෙන් පිළිගනිමු!')) {
        const mentionMatch = oldCaption.match(/👋 ආයුබෝවන් (.+?)! ❤️/s);
        const mention = mentionMatch?.[1] ? mentionMatch[1] : '<b>Friend</b>';
        const welcomeText = buildBotWelcomeText(mention);
        body.set('photo', WELCOME_IMAGE_URL);
        body.set('caption', welcomeText);
        body.set('parse_mode', 'HTML');
        body.set('reply_markup', JSON.stringify(buildBotWelcomeKeyboard()));
        return originalFetch(input, { ...init, body });
      }
    }

    if (method === 'POST' && /\/sendMessage(?:\?|$)/.test(url) && typeof body === 'string') {
      const payload = JSON.parse(body);
      const oldNotice = String(payload?.text || '');

      if (oldNotice.includes('𝙇𝙄𝙑𝙀 𝘾𝙊𝙉𝙏𝙀𝙉𝙏 𝘿𝘼𝙏𝘼𝘽𝘼𝙎𝙀')) {
        const existing = await getExistingLiveMessage();
        if (existing?.message_id) {
          const editPayload = {
            ...payload,
            chat_id: String(existing.chat_id || payload.chat_id),
            message_id: Number(existing.message_id)
          };
          const editUrl = url.replace('/sendMessage', '/editMessageText');
          console.log(`[catalog-bridge] Live database fallback converted to editMessageText for message ${existing.message_id}.`);
          return originalFetch(editUrl, { ...init, body: JSON.stringify(editPayload) });
        }
      }

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
            { text: '🔥𝐂𝐢𝐧𝐞 𝐔𝐧𝐢𝐯𝐞𝐫𝐬𝐞 | 𝐄𝐧𝐭𝐞𝐫𝐭𝐚𝐢𝐧𝐦𝐞𝐧𝐭 𝐇𝐮𝐛', url: 'https://t.me/+xXNo5N_k9aIxMTU9' }
          ]]
        };
        return originalFetch(input, { ...init, body: JSON.stringify(payload) });
      }
    }
  } catch (error) {
    console.warn('[catalog-bridge] Telegram message rewrite skipped:', error.message || error);
  }

  return originalFetch(input, init);
};

console.log('[catalog-bridge] Supabase catalog + downloads bridge loaded; live database same-message mode + new download sync + future FILE NOTICE + private welcome delivery enabled.');
