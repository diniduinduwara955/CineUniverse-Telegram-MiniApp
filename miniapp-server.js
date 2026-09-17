import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT || 10000);
const API_PORT = Number(process.env.API_PORT || (PORT === 8787 ? 8788 : 8787));
const API_ORIGIN = `http://127.0.0.1:${API_PORT}`;
const MINI_APP_URL = String(
  process.env.MINI_APP_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  `http://localhost:${PORT}`
).trim();

const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');
const logoPath = path.join(rootDir, 'cine-universe-logo.jpg');

function startApi() {
  const env = {
    ...process.env,
    PORT: String(API_PORT),
    MINI_APP_URL
  };

  const child = spawn(process.execPath, [path.join(rootDir, 'server', 'server.js')], {
    cwd: rootDir,
    env,
    stdio: 'inherit'
  });

  child.on('exit', (code, signal) => {
    console.error(`[miniapp-server] API process exited: code=${code ?? 'null'} signal=${signal ?? 'null'}`);
    process.exit(code ?? 1);
  });

  child.on('error', (error) => {
    console.error('[miniapp-server] Failed to start API process:', error.message);
    process.exit(1);
  });

  return child;
}

function copyHeaders(request) {
  const headers = {};
  for (const [key, value] of Object.entries(request.headers)) {
    if (key === 'host' || key === 'content-length' || key === 'connection') continue;
    if (value === undefined) continue;
    headers[key] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return headers;
}

function bodyForRequest(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  if (req.body === undefined) return undefined;

  const type = String(req.headers['content-type'] || '').toLowerCase();
  if (type.includes('application/json')) return JSON.stringify(req.body);
  if (type.includes('application/x-www-form-urlencoded')) return new URLSearchParams(req.body).toString();
  if (Buffer.isBuffer(req.body)) return req.body;
  return typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
}

async function fetchApiJson(pathname) {
  const response = await fetch(`${API_ORIGIN}${pathname}`, {
    headers: { Accept: 'application/json' }
  });
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { response, data };
}

async function catalogWithFallback(req, res, primaryPath, fallbackPath, fallbackMediaType) {
  try {
    const primary = await fetchApiJson(primaryPath);
    const primaryResults = Array.isArray(primary.data?.results) ? primary.data.results : [];

    if (primary.response.ok && primaryResults.length > 0) {
      res.status(primary.response.status).json(primary.data);
      return;
    }

    const fallback = await fetchApiJson(fallbackPath);
    if (fallback.response.ok && Array.isArray(fallback.data?.results)) {
      const results = fallback.data.results.map(item => ({
        ...item,
        mediaType: item.mediaType || fallbackMediaType,
        type: item.type || (fallbackMediaType === 'tv' ? 'TV Series' : 'Movie'),
        published: false,
        source: 'tmdb-fallback'
      }));
      res.json({
        ok: true,
        results,
        source: 'tmdb-fallback',
        notice: `No published ${fallbackMediaType === 'tv' ? 'TV series' : 'movies'} were found yet; showing live TMDB content.`
      });
      return;
    }

    if (primary.data) {
      res.status(primary.response.status || 502).json(primary.data);
      return;
    }

    res.status(502).json({ ok: false, error: 'Could not load catalog content.' });
  } catch (error) {
    console.error(`[miniapp-server] catalog fallback failed for ${primaryPath}:`, error.message);
    res.status(502).json({ ok: false, error: 'Could not load catalog content.' });
  }
}

async function proxyApi(req, res) {
  const target = `${API_ORIGIN}${req.originalUrl}`;

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: copyHeaders(req),
      body: bodyForRequest(req)
    });

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'transfer-encoding') return;
      res.setHeader(key, value);
    });

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.send(buffer);
  } catch (error) {
    console.error(`[miniapp-server] API proxy failed: ${req.method} ${req.originalUrl}`, error.message);
    res.status(502).json({ ok: false, error: 'API service is temporarily unavailable.' });
  }
}

function waitForApi(maxAttempts = 30, delayMs = 1000) {
  const healthUrl = `${API_ORIGIN}/api/health`;

  return new Promise((resolve) => {
    let attempt = 0;

    const check = async () => {
      attempt += 1;
      try {
        const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1500) });
        if (response.ok) {
          console.log(`[miniapp-server] API ready on ${API_ORIGIN}`);
          resolve(true);
          return;
        }
      } catch {}

      if (attempt >= maxAttempts) {
        console.warn('[miniapp-server] API health check timed out; continuing to serve the Mini App.');
        resolve(false);
        return;
      }

      setTimeout(check, delayMs);
    };

    check();
  });
}

if (!fs.existsSync(distDir)) {
  console.warn(`[miniapp-server] dist directory not found: ${distDir}`);
  console.warn('[miniapp-server] Run "npm run build" before starting the production server.');
}

startApi();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, service: 'cine-universe-mini-app', api: API_ORIGIN });
});

// The existing logo lives at the repository root. Serve it from the combined
// production server so the current React UI can keep using /cine-universe-logo.jpg.
app.get('/cine-universe-logo.jpg', (_req, res) => {
  if (!fs.existsSync(logoPath)) {
    res.status(404).end();
    return;
  }
  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  res.sendFile(logoPath);
});

// The React Mini App intentionally reads the Telegram-published catalog first.
// On a fresh Render instance the runtime JSON files may be empty or not yet
// present, so provide live TMDB content through the same endpoints as a safe
// display fallback. Published/download mappings remain handled by the backend.
app.get('/api/catalog', (req, res) =>
  catalogWithFallback(req, res, '/api/catalog', '/api/movies', 'movie')
);
app.get('/api/tv-catalog', (req, res) =>
  catalogWithFallback(req, res, '/api/tv-catalog', '/api/tv', 'tv')
);

app.use('/api', proxyApi);

app.use(express.static(distDir, {
  index: false,
  maxAge: '1h',
  setHeaders(res) {
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  }
}));

app.use((_req, res) => {
  const indexPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    res.status(503).send('Cine Universe Mini App is building. Please try again shortly.');
    return;
  }
  res.sendFile(indexPath);
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[miniapp-server] Mini App running on port ${PORT}`);
  console.log(`[miniapp-server] Public URL: ${MINI_APP_URL}`);
  void waitForApi();
});

function shutdown(signal) {
  console.log(`[miniapp-server] ${signal} received; shutting down.`);
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
