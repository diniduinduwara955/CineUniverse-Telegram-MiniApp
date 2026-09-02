// V91 additive Telegram presentation layer.
// Existing server/UI logic remains untouched. This module only reformats outgoing
// Telegram captions/messages for the configured Update Channel and Request Group.

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

function clean(text='') {
  return String(text).replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function formatChannel(text='') {
  const lines = clean(text).split('\n').map(x => x.trim()).filter(Boolean);
  if (!lines.length) return '';
  const out = [];
  for (const line of lines) {
    // Preserve decorative separators as compact separators.
    if (/^[╔╚═━─]+$/.test(line)) { out.push(line); continue; }
    out.push(line);
    // Give each logical information block breathing room.
    if (/^🎬 <b>CINE UNIVERSE<\/b>$/i.test(line) || /^📺 <b>CINE UNIVERSE<\/b>$/i.test(line)) out.push('');
    else if (/^🔥 <b>/.test(line)) out.push('');
    else if (/^📅 /.test(line) || /^🎯 /.test(line)) out.push('');
    else if (/^⭐ /.test(line)) out.push('');
    else if (/^🎭 /.test(line)) out.push('');
    else if (/^👥 /.test(line) || /^🌟 /.test(line)) out.push('');
    else if (/^📝 /.test(line)) out.push('');
    else if (/^📥 /.test(line)) out.push('');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function formatGroup(text='') {
  const lines = clean(text).split('\n').map(x => x.trim()).filter(Boolean);
  if (!lines.length) return '';
  const out = [];
  lines.forEach((line, i) => {
    out.push(line);
    if (i < lines.length - 1) {
      if (/^🎬 |^📺 /.test(line) || /^⭐ /.test(line) || /^✅ /.test(line)) out.push('');
    }
  });
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function style(text, chatId) {
  const id = String(chatId || '').trim();
  if (id === UPDATE_ID) return formatChannel(text);
  if (id === GROUP_ID) return formatGroup(text);
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

globalThis.fetch = async function v91Fetch(url, init={}) {
  const ep = endpoint(url);
  if (!['sendPhoto','sendMessage'].includes(ep) || !init?.body) return originalFetch(url, init);
  const chatId = bodyChatId(init.body);
  if (!chatId || ![UPDATE_ID, GROUP_ID].includes(String(chatId))) return originalFetch(url, init);

  if (typeof init.body === 'string') {
    try {
      const payload = JSON.parse(init.body);
      if (payload.text) payload.text = style(payload.text, chatId);
      if (payload.caption) payload.caption = style(payload.caption, chatId);
      return originalFetch(url, { ...init, body: JSON.stringify(payload) });
    } catch { return originalFetch(url, init); }
  }

  if (typeof FormData !== 'undefined' && init.body instanceof FormData) {
    const form = new FormData();
    for (const [k,v] of init.body.entries()) form.append(k,v);
    const cap = form.get('caption');
    if (cap) form.set('caption', style(cap, chatId));
    return originalFetch(url, { ...init, body: form });
  }
  return originalFetch(url, init);
};
