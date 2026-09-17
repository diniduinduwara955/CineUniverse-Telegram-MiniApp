// Telegram API startup/network resilience for Render.
// The unified listener already has a retry loop for getUpdates; this wrapper
// specifically protects the startup getWebhookInfo/getChat calls from a
// transient `fetch failed` so the listener is not disabled permanently.

const originalFetch = globalThis.fetch;
const TELEGRAM_API_PREFIX = 'https://api.telegram.org/bot';
const MAX_ATTEMPTS = Number(process.env.TELEGRAM_STARTUP_FETCH_RETRIES || 6);
const BASE_DELAY_MS = Number(process.env.TELEGRAM_STARTUP_FETCH_BASE_MS || 1500);

function isTelegramUrl(input) {
  try {
    return new URL(String(input?.url || input || '')).toString().startsWith(TELEGRAM_API_PREFIX);
  } catch {
    return false;
  }
}

function isStartupMethod(input) {
  try {
    const url = new URL(String(input?.url || input || ''));
    return /\/(?:getWebhookInfo|deleteWebhook|getChat|forwardMessage|copyMessage|getMe)$/.test(url.pathname);
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function resilientTelegramFetch(input, init) {
  if (!isTelegramUrl(input) || !isStartupMethod(input)) {
    return originalFetch(input, init);
  }

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await originalFetch(input, init);
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === MAX_ATTEMPTS) {
        return response;
      }
      lastError = new Error(`Telegram HTTP ${response.status}`);
    } catch (error) {
      // Preserve caller-controlled aborts (notably the long-poll timeout).
      if (error?.name === 'AbortError') throw error;
      lastError = error;
    }

    const delay = Math.min(BASE_DELAY_MS * (2 ** (attempt - 1)), 12000);
    console.warn(`[telegram-resilience] Telegram API request failed (attempt ${attempt}/${MAX_ATTEMPTS}); retrying in ${delay}ms:`, lastError?.message || lastError);
    await sleep(delay);
  }

  throw lastError || new Error('Telegram API request failed.');
}

globalThis.fetch = resilientTelegramFetch;
console.log('[telegram-resilience] Telegram startup fetch retry layer enabled.');
