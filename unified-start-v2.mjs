import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import express from 'express';
import { startSupabaseRuntimeSync } from './supabase-runtime-sync.mjs';
import { applyTmdbUploadMatchFix } from './tmdb-upload-match-fix.mjs';

const ROOT = process.cwd();
const serverDir = path.join(ROOT, 'server');
const publicDir = path.join(ROOT, 'public');
const distDir = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 10000);
const BACKEND_PORT = PORT + 1;

await fs.mkdir(serverDir, { recursive: true });
await fs.mkdir(publicDir, { recursive: true });

async function ensureJsonFile(relativePath, fallback) {
  const target = path.join(ROOT, relativePath);
  try { await fs.access(target); return; } catch {}
  await fs.writeFile(target, JSON.stringify(fallback, null, 2), 'utf8');
}

async function copyIfMissing(sourceRelative, targetRelative) {
  const source = path.join(ROOT, sourceRelative);
  const target = path.join(ROOT, targetRelative);
  try { await fs.access(target); return; } catch {}
  try {
    await fs.copyFile(source, target);
    console.log(`[unified-bootstrap] copied ${sourceRelative} -> ${targetRelative}`);
  } catch (err) {
    console.warn(`[unified-bootstrap] optional copy skipped: ${sourceRelative}: ${err.message || err}`);
  }
}

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
      console.warn(`[unified-bootstrap] asset source looks invalid: ${sourceRelative} (${sourceStat.size} bytes)`);
      return;
    }
    await fs.copyFile(source, target);
    console.log(`[unified-bootstrap] repaired asset ${sourceRelative} -> ${targetRelative} (${sourceStat.size} bytes)`);
  } catch (err) {
    console.warn(`[unified-bootstrap] asset repair skipped: ${sourceRelative}: ${err.message || err}`);
  }
}

async function injectUiEnhancements() {
  const indexFile = path.join(distDir, 'index.html');
  try {
    let html = await fs.readFile(indexFile, 'utf8');
    let changed = false;
    if (!html.includes('cine-ui-enhancements-v1.css')) {
      html = html.replace('</head>', '  <link rel="stylesheet" href="/cine-ui-enhancements-v1.css">\n</head>');
      changed = true;
    }
    if (!html.includes('cine-ui-enhancements-v1.js')) {
      html = html.replace('</body>', '  <script defer src="/cine-ui-enhancements-v1.js"></script>\n</body>');
      changed = true;
    }
    if (changed) {
      await fs.writeFile(indexFile, html, 'utf8');
      console.log('[unified-bootstrap] additive UI enhancements injected');
    }
  } catch (err) {
    console.warn('[unified-bootstrap] UI enhancement injection skipped:', err.message || err);
  }
}

await copyIfMissing('published-catalog.json', 'server/published-catalog.json');
await copyIfMissing('published-tv-catalog.json', 'server/published-tv-catalog.json');
await copyIfMissing('tv-channel-map.json', 'server/tv-channel-map.json');
await ensureValidAsset('cine-universe-logo.jpg', 'public/cine-universe-logo.jpg', 1024);
await ensureJsonFile('server/downloads.json', {});
await ensureJsonFile('server/file-expiry-jobs.json', []);
await ensureJsonFile('server/telegram-offset.json', { offset: Number(process.env.CHANNEL_UPDATE_OFFSET || 0) });

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

async function prepareTelegramPolling() {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) {
    console.warn('[unified-bootstrap] TELEGRAM_BOT_TOKEN missing; webhook check skipped.');
    return;
  }
  try {
    const infoRes = await originalFetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const info = await infoRes.json();
    const webhookUrl = String(info?.result?.url || '').trim();
    console.log(`[unified-bootstrap] webhook=${webhookUrl || '(none)'} pending=${Number(info?.result?.pending_update_count || 0)}`);
    if (webhookUrl) {
      const deleteRes = await originalFetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=false`);
      const deleted = await deleteRes.json();
      if (!deleteRes.ok || !deleted.ok) {
        console.error('[unified-bootstrap] failed to clear Telegram webhook:', deleted?.description || deleteRes.status);
      } else {
        console.log('[unified-bootstrap] Telegram webhook cleared; getUpdates polling enabled.');
      }
    } else {
      console.log('[unified-bootstrap] Telegram webhook is already clear; getUpdates polling can run.');
    }
  } catch (err) {
    console.error('[unified-bootstrap] Telegram webhook preparation failed:', err.message || err);
  }
}

await prepareTelegramPolling();
await applyTmdbUploadMatchFix();
await startSupabaseRuntimeSync();
await injectUiEnhancements();
console.log(`[unified-bootstrap] starting existing backend on internal port ${BACKEND_PORT}`);

const backend = spawn(process.execPath, ['server.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(BACKEND_PORT) },
  stdio: ['inherit', 'inherit', 'inherit']
});
backend.on('exit', (code, signal) => {
  console.error(`[unified-backend] exited code=${code} signal=${signal || 'none'}`);
  process.exit(code ?? 1);
});

const app = express();
app.use('/api', express.raw({ type: '*/*', limit: '25mb' }));
app.use('/api', async (req, res) => {
  try {
    const target = `http://127.0.0.1:${BACKEND_PORT}${req.originalUrl}`;
    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      const lower = key.toLowerCase();
      if (lower === 'host' || lower === 'content-length' || lower === 'connection') continue;
      if (value !== undefined) headers[key] = Array.isArray(value) ? value.join(', ') : value;
    }
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : (req.body?.length ? req.body : undefined);
    const upstream = await fetch(target, { method: req.method, headers, body });
    const responseBuffer = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (!['content-encoding', 'transfer-encoding', 'connection', 'content-length'].includes(lower)) res.setHeader(key, value);
    });
    res.send(responseBuffer);
  } catch (err) {
    console.error('[unified-proxy] API proxy failed:', err.message || err);
    res.status(502).json({ ok: false, error: 'API backend unavailable.' });
  }
});

app.use(express.static(distDir, { index: 'index.html' }));
app.use(async (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api')) return next();
  try {
    await fs.access(path.join(distDir, 'index.html'));
    res.sendFile(path.join(distDir, 'index.html'));
  } catch {
    res.status(503).send('Cine Universe frontend build is not available yet.');
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[unified-web] Cine Universe single deployment listening on port ${PORT}`);
  console.log(`[unified-web] frontend=/  api=/api  backend=127.0.0.1:${BACKEND_PORT}`);
});

function shutdown(signal) {
  console.log(`[unified-web] ${signal} received; stopping backend`);
  backend.kill(signal);
  setTimeout(() => backend.kill('SIGKILL'), 3000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));