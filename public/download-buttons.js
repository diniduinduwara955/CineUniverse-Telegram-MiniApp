(() => {
  const API_BASE = '/api';
  const QUALITY_ORDER = ['4K', '1080P', '720P', '480P'];
  let catalogByTitle = new Map();
  let loaded = false;
  let loadingPromise = null;

  const normalizeTitle = (value = '') => String(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[._-]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  function qualityLabel(q) {
    return q === '1080P' ? '1080P' : q === '720P' ? '720P' : q === '480P' ? '480P' : '4K';
  }

  async function loadPublishedCatalog() {
    if (loaded) return catalogByTitle;
    if (loadingPromise) return loadingPromise;

    loadingPromise = Promise.all([
      fetch(`${API_BASE}/catalog`, { headers: { Accept: 'application/json' } }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${API_BASE}/tv-catalog`, { headers: { Accept: 'application/json' } }).then(r => r.ok ? r.json() : null).catch(() => null)
    ]).then(([movies, tv]) => {
      const movieResults = Array.isArray(movies?.results) ? movies.results : [];
      const tvResults = Array.isArray(tv?.results) ? tv.results : [];
      catalogByTitle = new Map();

      for (const item of movieResults) {
        const title = normalizeTitle(item?.title);
        if (!title) continue;
        catalogByTitle.set(`movie:${title}`, item);
      }

      for (const item of tvResults) {
        const title = normalizeTitle(item?.title);
        if (!title) continue;
        const key = `tv:${title}`;
        if (!catalogByTitle.has(key)) catalogByTitle.set(key, item);
      }

      loaded = true;
      return catalogByTitle;
    }).finally(() => {
      loadingPromise = null;
    });

    return loadingPromise;
  }

  function getCardTitle(card) {
    return normalizeTitle(card.querySelector('strong')?.textContent || '');
  }

  function showTelegramAlert(message) {
    try {
      if (window.Telegram?.WebApp?.showAlert) {
        window.Telegram.WebApp.showAlert(message);
        return;
      }
    } catch {}
    try { window.alert(message); } catch {}
  }

  async function deliverQuality(item, quality, pill) {
    const initData = String(window.Telegram?.WebApp?.initData || '');
    if (!initData) {
      showTelegramAlert('Open Cine Universe inside Telegram to use direct download delivery.');
      return;
    }

    pill.dataset.busy = '1';
    pill.textContent = '…';
    try {
      const response = await fetch(`${API_BASE}/download`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          initData,
          mediaType: 'movie',
          mediaId: Number(item.id),
          quality
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Download delivery failed.');
      pill.textContent = '✓';
      showTelegramAlert(`${item.title} • ${quality} has been sent to your Telegram bot.`);
      setTimeout(() => { if (pill.isConnected) pill.textContent = qualityLabel(quality); }, 1400);
    } catch (error) {
      pill.textContent = qualityLabel(quality);
      showTelegramAlert(error?.message || 'Download delivery failed.');
    } finally {
      delete pill.dataset.busy;
    }
  }

  function createDownloadBar(item) {
    const qualities = item?.qualities || {};
    const available = QUALITY_ORDER.filter(q => qualities[q]?.available);
    if (!available.length) return null;

    const bar = document.createElement('div');
    bar.className = 'cine-card-download-bar';
    bar.setAttribute('aria-label', 'Download quality options');
    bar.style.cssText = [
      'display:flex',
      'flex-wrap:wrap',
      'gap:4px',
      'width:100%',
      'margin:7px 0 0',
      'align-items:center'
    ].join(';');

    for (const quality of available) {
      const pill = document.createElement('span');
      pill.className = 'cine-card-download-pill';
      pill.textContent = qualityLabel(quality);
      pill.setAttribute('role', 'button');
      pill.setAttribute('tabindex', '0');
      pill.title = `Send ${quality} to Telegram`;
      pill.style.cssText = [
        'display:inline-flex',
        'align-items:center',
        'justify-content:center',
        'min-height:26px',
        'padding:0 8px',
        'border-radius:8px',
        'border:1px solid rgba(255,255,255,.14)',
        'background:linear-gradient(135deg,rgba(255,40,75,.22),rgba(35,75,130,.20))',
        'box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 5px 15px rgba(0,0,0,.20)',
        'color:#fff',
        'font-size:9px',
        'font-weight:900',
        'letter-spacing:.02em',
        'cursor:pointer',
        'user-select:none',
        'touch-action:manipulation',
        'transition:transform .16s ease, border-color .16s ease, background .16s ease'
      ].join(';');

      const click = event => {
        event.preventDefault();
        event.stopPropagation();
        if (pill.dataset.busy === '1') return;
        deliverQuality(item, quality, pill);
      };

      pill.addEventListener('click', click);
      pill.addEventListener('touchstart', event => { event.stopPropagation(); }, { passive: true });
      pill.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') click(event);
      });
      pill.addEventListener('pointerenter', () => { pill.style.transform = 'translateY(-1px)'; });
      pill.addEventListener('pointerleave', () => { pill.style.transform = ''; });
      bar.appendChild(pill);
    }

    return bar;
  }

  function decorateCards() {
    if (!loaded) return;
    const cards = document.querySelectorAll('.poster-card');
    for (const card of cards) {
      if (card.dataset.cineDownloadReady === '1') continue;
      const title = getCardTitle(card);
      if (!title) continue;

      const item = catalogByTitle.get(`movie:${title}`);
      if (!item) {
        card.dataset.cineDownloadReady = '1';
        continue;
      }

      const bar = createDownloadBar(item);
      card.dataset.cineDownloadReady = '1';
      if (!bar) continue;

      const poster = card.querySelector('.poster');
      if (poster) {
        poster.insertAdjacentElement('afterend', bar);
      } else {
        card.prepend(bar);
      }
    }
  }

  async function boot() {
    try {
      await loadPublishedCatalog();
      decorateCards();
    } catch {}

    const observer = new MutationObserver(() => decorateCards());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
