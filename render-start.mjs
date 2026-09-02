import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const serverDir = path.join(ROOT, 'server');
const publicDir = path.join(ROOT, 'public');

await fs.mkdir(serverDir, { recursive: true });
await fs.mkdir(publicDir, { recursive: true });

async function ensureJsonFile(relativePath, fallback) {
  const target = path.join(ROOT, relativePath);
  try {
    await fs.access(target);
    return;
  } catch {}
  await fs.writeFile(target, JSON.stringify(fallback, null, 2), 'utf8');
}

async function copyIfMissing(sourceRelative, targetRelative) {
  const source = path.join(ROOT, sourceRelative);
  const target = path.join(ROOT, targetRelative);
  try {
    await fs.access(target);
    return;
  } catch {}
  try {
    await fs.copyFile(source, target);
    console.log(`[render-bootstrap] copied ${sourceRelative} -> ${targetRelative}`);
  } catch (err) {
    console.warn(`[render-bootstrap] optional copy skipped: ${sourceRelative}: ${err.message || err}`);
  }
}

// Same as copyIfMissing, but also repairs a placeholder/zero-byte asset already present
// in the repository. This keeps the bot welcome-photo flow intact without touching React UI files.
async function ensureValidAsset(sourceRelative, targetRelative, minimumBytes = 1024) {
  const source = path.join(ROOT, sourceRelative);
  const target = path.join(ROOT, targetRelative);
  try {
    const stat = await fs.stat(target);
    if (stat.isFile() && stat.size >= minimumBytes) return;
  } catch {}

  try {
    const sourceStat = await fs.stat(source);
    if (!sourceStat.isFile() || sourceStat.size < minimumBytes) {
      console.warn(`[render-bootstrap] asset source looks invalid: ${sourceRelative} (${sourceStat.size} bytes)`);
      return;
    }
    await fs.copyFile(source, target);
    console.log(`[render-bootstrap] repaired asset ${sourceRelative} -> ${targetRelative} (${sourceStat.size} bytes)`);
  } catch (err) {
    console.warn(`[render-bootstrap] asset repair skipped: ${sourceRelative}: ${err.message || err}`);
  }
}

// server.js stores runtime state under /server. Create the expected files on Render's
// fresh filesystem so the listener can start cleanly on every deploy.
await copyIfMissing('published-catalog.json', 'server/published-catalog.json');
await copyIfMissing('published-tv-catalog.json', 'server/published-tv-catalog.json');
await copyIfMissing('tv-channel-map.json', 'server/tv-channel-map.json');
await ensureValidAsset('cine-universe-logo.jpg', 'public/cine-universe-logo.jpg', 1024);
await ensureJsonFile('server/downloads.json', {});
await ensureJsonFile('server/file-expiry-jobs.json', []);
await ensureJsonFile('server/telegram-offset.json', { offset: Number(process.env.CHANNEL_UPDATE_OFFSET || 0) });

// Guard the Telegram JSON payload used by the legacy server implementation. Some
// existing fallback paths pass { inline_keyboard: { inline_keyboard: [...] } }.
// Normalize only that malformed shape; all valid Telegram requests remain unchanged.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  if (init?.body && typeof init.body === 'string' && String(init.headers?.['content-type'] || init.headers?.['Content-Type'] || '').includes('application/json')) {
    try {
      const body = JSON.parse(init.body);
      if (body && body.reply_markup && body.reply_markup.inline_keyboard && body.reply_markup.inline_keyboard.inline_keyboard) {
        body.reply_markup = body.reply_markup.inline_keyboard;
        init = { ...init, body: JSON.stringify(body) };
      }
    } catch {}
  }
  return originalFetch(input, init);
};

console.log('[render-bootstrap] runtime files ready');
await import('./server.js');
