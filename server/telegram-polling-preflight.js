import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

const BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
const POLL_START_DELAY_MS = Number(process.env.TELEGRAM_POLL_START_DELAY_MS || 20000);
const WELCOME_IMAGE_PATH = path.join(process.cwd(), 'public', 'cine-universe-bot-welcome.jpg');
const WELCOME_HANDLED_MARKER = '__CINE_UNIVERSE_WELCOME_HANDLED__';

async function telegram(method, payload = {}) {
  if (!BOT_TOKEN) return null;
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data?.description || `Telegram HTTP ${response.status}`);
  }
  return data.result;
}

async function sendCineUniverseWelcome(message, originalFetch) {
  const user = message?.from || {};
  const display = String(user.first_name || user.username || 'Friend').trim();
  const userId = Number(user.id || 0);
  const mention = userId
    ? `<a href="tg://user?id=${userId}">${String(display).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}</a>`
    : `<b>${String(display).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}</b>`;

  const caption = [
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
    '© 2026 𝘾𝙞𝙣𝙚 𝙐𝙉𝙄𝙑𝙀𝙍𝙎𝙀'
  ].join('\n');

  const keyboard = {
    inline_keyboard: [
      [{ text: '🎬 𝐂𝐢𝐧𝐞 𝐔𝐧𝐢𝐯𝐞𝐫𝐬𝐞 | 𝐑𝐞𝐪𝐮𝐞𝐬𝐭 𝐇𝐮𝐛', url: 'https://t.me/dinidupitigala2003' }],
      [{ text: '🔥𝐂𝐢𝐧𝐞 𝐔𝐧𝐢𝐯𝐞𝐫𝐬𝐞 | 𝐄𝐧𝐭𝐞𝐫𝐭𝐚𝐢𝐧𝐦𝐞𝐧𝐭 𝐇𝐮𝐛', url: 'https://t.me/dinidu20030304' }]
    ]
  };

  const photo = await fs.readFile(WELCOME_IMAGE_PATH);
  const form = new FormData();
  form.append('chat_id', String(message.chat.id));
  form.append('photo', new Blob([photo], { type: 'image/jpeg' }), 'cine-universe-bot-welcome.jpg');
  form.append('caption', caption);
  form.append('parse_mode', 'HTML');
  form.append('reply_markup', JSON.stringify(keyboard));

  const response = await originalFetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
    method: 'POST',
    body: form
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data?.description || `Telegram HTTP ${response.status}`);
  }
}

function installWelcomeStartPatch() {
  if (globalThis.__CINE_UNIVERSE_WELCOME_START_PATCH__) return;
  globalThis.__CINE_UNIVERSE_WELCOME_START_PATCH__ = true;
  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async function(input, init = {}) {
    const url = String(typeof input === 'string' ? input : input?.url || '');
    const method = String(init?.method || (typeof input !== 'string' ? input?.method || 'GET' : 'GET')).toUpperCase();

    if (method === 'GET' && /\/getUpdates(?:\?|$)/.test(url)) {
      const response = await originalFetch(input, init);
      if (!response.ok) return response;

      let payload;
      try {
        payload = await response.clone().json();
      } catch {
        return response;
      }

      let changed = false;
      const updates = Array.isArray(payload?.result) ? payload.result : [];

      for (const update of updates) {
        const message = update?.message;
        if (message?.chat?.type !== 'private') continue;
        const text = String(message?.text || '').trim();
        if (!/^\/start(?:@\w+)?(?:\s+.*)?$/i.test(text)) continue;

        try {
          await sendCineUniverseWelcome(message, originalFetch);
          message.text = WELCOME_HANDLED_MARKER;
          if (Array.isArray(message.entities)) message.entities = [];
          changed = true;
        } catch (error) {
          console.error('[telegram-preflight] /start welcome send failed:', error.message || error);
        }
      }

      if (!changed) return response;

      const headers = new Headers(response.headers);
      headers.set('content-type', 'application/json');
      return new Response(JSON.stringify(payload), {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }

    return originalFetch(input, init);
  };
}

export async function prepareTelegramPolling() {
  if (!BOT_TOKEN) {
    console.warn('[telegram-preflight] TELEGRAM_BOT_TOKEN is not configured.');
    return;
  }

  try {
    const info = await telegram('getWebhookInfo');
    const webhookUrl = String(info?.url || '').trim();

    if (webhookUrl) {
      console.warn(`[telegram-preflight] Webhook detected (${webhookUrl}). Removing it so the existing polling listener can run.`);
      await telegram('deleteWebhook', { drop_pending_updates: false });
      console.log('[telegram-preflight] Webhook removed; polling mode is ready.');
    } else {
      console.log('[telegram-preflight] No webhook configured; polling mode is ready.');
    }

    // Render can briefly overlap the previous instance and the new instance
    // during a deploy. Telegram allows only one active getUpdates consumer for
    // a bot token, so give the previous instance time to shut down before the
    // new polling listener starts. This targets HTTP 409 only and leaves the
    // existing bot/group workflow unchanged.
    if (POLL_START_DELAY_MS > 0) {
      console.log(`[telegram-preflight] Waiting ${Math.round(POLL_START_DELAY_MS / 1000)}s before starting polling to avoid Telegram 409 overlap.`);
      await new Promise(resolve => setTimeout(resolve, POLL_START_DELAY_MS));
    }

    installWelcomeStartPatch();
    console.log('[telegram-preflight] /start cinematic welcome patch ready.');
  } catch (error) {
    // Do not prevent the existing Cine Universe server from starting if Telegram
    // is temporarily unreachable. The original bot logic remains untouched.
    console.warn('[telegram-preflight] Check skipped:', error.message || error);
    installWelcomeStartPatch();
  }
}

await prepareTelegramPolling();
