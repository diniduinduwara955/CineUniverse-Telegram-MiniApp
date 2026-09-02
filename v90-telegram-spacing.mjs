// V90 additive Telegram presentation layer.
// Does not modify existing server logic; intercepts outgoing Telegram captions/messages
// and applies spacing only to the Update Channel and Request Group.

const UPDATE_ID = String(process.env.UPDATE_CHANNEL_CHAT_ID || process.env.TELEGRAM_UPDATE_CHANNEL_ID || '').trim();
const GROUP_ID = String(process.env.MOVIE_REQUEST_GROUP_CHAT_ID || process.env.REQUEST_GROUP_CHAT_ID || process.env.TELEGRAM_REQUEST_GROUP_ID || '').trim();

const originalFetch = globalThis.fetch;

function normalizeSpaces(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function addUpdateChannelSpacing(text) {
  const clean = normalizeSpaces(text);
  if (!clean) return clean;
  const lines = clean.split('\n');
  const out = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    out.push(line);
    // Clear visual blocks without making the Telegram caption too tall.
    if (/^🎬 <b>CINE UNIVERSE<\/b>$/i.test(line)) out.push('');
    else if (/^📺 <b>CINE UNIVERSE<\/b>$/i.test(line)) out.push('');
    else if (/^🔥 <b>.*<\/b>/.test(line)) out.push('');
    else if (/^⭐ <b>IMDb<\/b>/.test(line)) out.push('');
    else if (/^🎭 /.test(line)) out.push('');
    else if (/^👥 /.test(line)) out.push('');
    else if (/^🎯 /.test(line)) out.push('');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function addGroupSpacing(text) {
  const clean = normalizeSpaces(text);
  if (!clean) return clean;
  const lines = clean.split('\n').filter(Boolean);
  if (!lines.length) return clean;
  const out = [lines[0], ''];
  for (let i = 1; i < lines.length; i += 1) {
    out.push(lines[i]);
    if (i < lines.length - 1 && (/^⭐ /.test(lines[i]) || /^✅ /.test(lines[i]))) out.push('');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function styleCaption(text, chatId) {
  const id = String(chatId || '').trim();
  if (UPDATE_ID && id === UPDATE_ID) return addUpdateChannelSpacing(text);
  if (GROUP_ID && id === GROUP_ID) return addGroupSpacing(text);
  return text;
}

function extractChatIdFromUrl(url, init) {
  try {
    const u = new URL(String(url));
    const endpoint = u.pathname.split('/').pop();
    if (!['sendPhoto','sendMessage','sendDocument','sendVideo','sendAudio'].includes(endpoint)) return '';
    const body = init?.body;
    if (!body) return '';
    if (typeof body === 'string') {
      try { return JSON.parse(body)?.chat_id ?? ''; } catch {}
    }
    if (typeof FormData !== 'undefined' && body instanceof FormData) return body.get('chat_id') ?? '';
  } catch {}
  return '';
}

function extractEndpoint(url) {
  try { return new URL(String(url)).pathname.split('/').pop(); } catch { return ''; }
}

globalThis.fetch = async function v90Fetch(url, init = {}) {
  const endpoint = extractEndpoint(url);
  const isMessageEndpoint = ['sendPhoto','sendMessage'].includes(endpoint);
  if (!isMessageEndpoint || !init?.body) return originalFetch(url, init);

  const chatId = extractChatIdFromUrl(url, init);
  if (!chatId || (!UPDATE_ID || String(chatId) !== UPDATE_ID) && (!GROUP_ID || String(chatId) !== GROUP_ID)) {
    return originalFetch(url, init);
  }

  if (typeof init.body === 'string') {
    try {
      const payload = JSON.parse(init.body);
      if (payload.text) payload.text = styleCaption(payload.text, chatId);
      const next = { ...init, body: JSON.stringify(payload) };
      return originalFetch(url, next);
    } catch {
      return originalFetch(url, init);
    }
  }

  if (typeof FormData !== 'undefined' && init.body instanceof FormData) {
    const form = new FormData();
    for (const [key, value] of init.body.entries()) form.append(key, value);
    const caption = form.get('caption');
    if (caption) form.set('caption', styleCaption(caption, chatId));
    return originalFetch(url, { ...init, body: form });
  }

  return originalFetch(url, init);
};
