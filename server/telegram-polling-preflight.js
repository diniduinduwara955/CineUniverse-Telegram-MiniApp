import 'dotenv/config';

const BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();

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
  } catch (error) {
    // Do not prevent the existing Cine Universe server from starting if Telegram
    // is temporarily unreachable. The original bot logic remains untouched.
    console.warn('[telegram-preflight] Check skipped:', error.message || error);
  }
}

await prepareTelegramPolling();
