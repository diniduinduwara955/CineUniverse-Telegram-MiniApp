import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const serverDir = path.join(ROOT, 'server');
await fs.mkdir(serverDir, { recursive: true });

// Normalize Telegram reply_markup payloads before server.js sends them.
// This keeps the existing server.js untouched while fixing accidentally nested
// inline_keyboard objects used by some fallback paths.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  try {
    if (typeof init?.body === 'string') {
      const contentType = String(init?.headers?.['content-type'] || init?.headers?.['Content-Type'] || '').toLowerCase();
      if (contentType.includes('application/json')) {
        const body = JSON.parse(init.body);
        const markup = body?.reply_markup;
        if (Array.isArray(markup)) {
          body.reply_markup = { inline_keyboard: markup };
        } else if (markup && typeof markup === 'object' && markup.inline_keyboard && !Array.isArray(markup.inline_keyboard)) {
          const nested = markup.inline_keyboard;
          if (nested && typeof nested === 'object' && Array.isArray(nested.inline_keyboard)) {
            body.reply_markup = { inline_keyboard: nested.inline_keyboard };
          }
        }
        init = { ...init, body: JSON.stringify(body) };
      }
    }
  } catch {
    // Leave unrelated requests untouched.
  }
  return originalFetch(input, init);
};

async function copyIfMissing(sourceRelative, targetRelative) {
  const source = path.join(ROOT, sourceRelative);
  const target = path.join(ROOT, targetRelative);
  try { await fs.access(target); return; } catch {}
  try { await fs.copyFile(source, target); console.log(`[telegram-startup-fix] copied ${sourceRelative} -> ${targetRelative}`); }
  catch (err) { console.warn(`[telegram-startup-fix] optional copy skipped: ${err.message || err}`); }
}

await copyIfMissing('published-catalog.json', 'server/published-catalog.json');
await copyIfMissing('published-tv-catalog.json', 'server/published-tv-catalog.json');
await copyIfMissing('tv-channel-map.json', 'server/tv-channel-map.json');

async function prepareTelegramPolling() {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is missing.');

  const base = `https://api.telegram.org/bot${token}`;
  const infoRes = await fetch(`${base}/getWebhookInfo`);
  const info = await infoRes.json();
  if (!infoRes.ok || !info.ok) throw new Error(info?.description || `getWebhookInfo HTTP ${infoRes.status}`);

  const webhookUrl = String(info?.result?.url || '').trim();
  console.log(`[telegram-startup-fix] webhook=${webhookUrl || '(none)'} pending=${Number(info?.result?.pending_update_count || 0)}`);

  if (webhookUrl) {
    const deleteRes = await fetch(`${base}/deleteWebhook?drop_pending_updates=false`);
    const deleted = await deleteRes.json();
    if (!deleteRes.ok || !deleted.ok) throw new Error(deleted?.description || `deleteWebhook HTTP ${deleteRes.status}`);
    console.log('[telegram-startup-fix] webhook cleared; polling is enabled.');
  }

  const allowed = encodeURIComponent(JSON.stringify(['message', 'channel_post', 'callback_query']));
  const probeRes = await fetch(`${base}/getUpdates?timeout=0&allowed_updates=${allowed}`);
  const probe = await probeRes.json();
  if (!probeRes.ok || !probe.ok) {
    if (probeRes.status === 409) {
      throw new Error('Telegram HTTP 409: another getUpdates consumer is active. Stop the previous Render service/instance using this bot token, then redeploy.');
    }
    throw new Error(probe?.description || `getUpdates probe HTTP ${probeRes.status}`);
  }
  const count = Array.isArray(probe.result) ? probe.result.length : 0;
  console.log(`[telegram-startup-fix] getUpdates probe OK; pending updates returned=${count}`);
}

await prepareTelegramPolling();

console.log('[telegram-startup-fix] starting server.js');
const child = spawn(process.execPath, ['server.js'], {
  cwd: ROOT,
  env: { ...process.env },
  stdio: ['inherit', 'inherit', 'inherit']
});

const shutdown = (signal) => {
  try { child.kill(signal); } catch {}
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
