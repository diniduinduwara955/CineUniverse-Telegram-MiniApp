// V94 additive Telegram message presentation layer.
// Existing server/UI logic is intentionally untouched. This module only reformats
// outgoing messages/captions destined for the Update Channel and Request Group.

const UPDATE_ID = String(
  process.env.UPDATE_CHANNEL_CHAT_ID ||
  process.env.TELEGRAM_UPDATE_CHANNEL_ID ||
  '-1004336626745'
).trim();

const GROUP_ID = String(
  process.env.MOVIE_REQUEST_GROUP_CHAT_ID ||
  process.env.REQUEST_GROUP_CHAT_ID ||
  process.env.TELEGRAM_REQUEST_GROUP_ID ||
  '-5592309385'
).trim();

const originalFetch = globalThis.fetch;

function normalize(text = '') {
  return String(text)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isSeparator(line) {
  return /^[\-_=━─═·•]+$/.test(line.trim());
}

function addBlank(out) {
  if (out.length && out[out.length - 1] !== '') out.push('');
}

function updateChannelFormat(text = '') {
  const lines = normalize(text).split('\n').map(s => s.trim()).filter(Boolean);
  if (!lines.length) return '';

  const out = [];
  let afterStory = false;

  for (const line of lines) {
    if (isSeparator(line)) {
      addBlank(out);
      out.push(line);
      addBlank(out);
      continue;
    }

    // Keep multi-line cast/story content together, while separating major blocks.
    const startsBlock =
      /^🎬\s*/.test(line) ||
      /^📺\s*/.test(line) ||
      /^⭐\s*/.test(line) ||
      /^🎭\s*/.test(line) ||
      /^👥\s*/.test(line) ||
      /^🌟\s*/.test(line) ||
      /^📝\s*/.test(line) ||
      /^📥\s*/.test(line) ||
      /^⬇️\s*/.test(line) ||
      /^✨\s*/.test(line);

    if (startsBlock && out.length) addBlank(out);
    out.push(line);

    if (/^📝\s*/.test(line)) afterStory = true;
    else if (afterStory && (/^📥\s*/.test(line) || /^⬇️\s*/.test(line))) {
      addBlank(out);
      afterStory = false;
    }
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function groupFormat(text = '') {
  const lines = normalize(text).split('\n').map(s => s.trim()).filter(Boolean);
  if (!lines.length) return '';

  const out = [];
  for (const line of lines) {
    const important = /^(🎬|📺|⭐|✅|📥|⬇️|👉|✨)\s*/.test(line);
    if (important && out.length) addBlank(out);
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function style(text, chatId) {
  const id = String(chatId || '').trim();
  if (id === UPDATE_ID) return updateChannelFormat(text);
  if (id === GROUP_ID) return groupFormat(text);
  return text;
}

function endpoint(url) {
  try { return new URL(String(url)).pathname.split('/').pop(); } catch { return ''; }
}

function bodyChatId(body) {
  try {
    if (typeof body === 'string') return JSON.parse(body)?.chat_id ?? '';
    if (typeof FormData !== 'undefined' && body instanceof FormData) return body.get('chat_id') ?? '';
  } catch {}
  return '';
}

globalThis.fetch = async function v94Fetch(url, init = {}) {
  const ep = endpoint(url);
  if (!['sendPhoto', 'sendMessage', 'sendVideo', 'sendDocument', 'sendAudio'].includes(ep) || !init?.body) {
    return originalFetch(url, init);
  }

  const chatId = String(bodyChatId(init.body) || '').trim();
  if (![UPDATE_ID, GROUP_ID].includes(chatId)) return originalFetch(url, init);

  if (typeof init.body === 'string') {
    try {
      const payload = JSON.parse(init.body);
      if (payload.text) payload.text = style(payload.text, chatId);
      if (payload.caption) payload.caption = style(payload.caption, chatId);
      return originalFetch(url, { ...init, body: JSON.stringify(payload) });
    } catch {
      return originalFetch(url, init);
    }
  }

  if (typeof FormData !== 'undefined' && init.body instanceof FormData) {
    const form = new FormData();
    for (const [k, v] of init.body.entries()) form.append(k, v);
    const text = form.get('text');
    const caption = form.get('caption');
    if (text) form.set('text', style(text, chatId));
    if (caption) form.set('caption', style(caption, chatId));
    return originalFetch(url, { ...init, body: form });
  }

  return originalFetch(url, init);
};

console.log(`[v94-layout] active | update=${UPDATE_ID} | group=${GROUP_ID}`);
