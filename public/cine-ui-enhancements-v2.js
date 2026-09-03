/* Cine Universe V2 additive UI patch. No core React/server files are modified. */
(() => {
  if (window.__CINE_UNIVERSE_UI_V2__) return;
  window.__CINE_UNIVERSE_UI_V2__ = true;

  const API = window.location.origin;
  let movieCatalog = [];
  let tvCatalog = [];
  let catalogLoaded = false;
  let searchTimer = null;
  let statsTimer = null;

  const normalize = (value) => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const asArray = (value) => Array.isArray(value) ? value : (value ? [value] : []);

  const posterOf = (item) => {
    const raw = String(item?.poster || item?.posterUrl || '').trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    if (item?.poster_path) return `https://image.tmdb.org/t/p/w342${item.poster_path}`;
    if (raw) return raw.startsWith('/') ? raw : `/${raw.replace(/^\.\//, '')}`;
    return '';
  };

  const titleOf = (item) => String(item?.title || item?.name || item?.original_title || item?.original_name || 'Untitled').trim();
  const yearOf = (item) => String(item?.year || item?.release_date || item?.first_air_date || '').slice(0, 4) || '—';
  const ratingOf = (item) => {
    const n = Number(item?.rating ?? item?.vote_average);
    return Number.isFinite(n) && n > 0 ? n.toFixed(1) : '—';
  };

  async function getJson(path) {
    const res = await fetch(`${API}${path}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
  }

  async function loadCatalog() {
    try {
      const [movies, tv] = await Promise.all([getJson('/api/catalog'), getJson('/api/tv-catalog')]);
      movieCatalog = movies.filter(x => x && x.published !== false);
      tvCatalog = tv.filter(x => x && x.published !== false);
      catalogLoaded = true;
      return [...movieCatalog.map(x => ({ ...x, __kind: 'Movie', mediaType: 'movie' })), ...tvCatalog.map(x => ({ ...x, __kind: 'TV Series', mediaType: 'tv' }))];
    } catch (err) {
      catalogLoaded = false;
      console.warn('[Cine UI V2] catalog load failed:', err.message || err);
      return [];
    }
  }

  function tokens(value) {
    return normalize(value).split(/\s+/).filter(Boolean);
  }

  function searchScore(item, query) {
    const q = normalize(query);
    if (!q) return 0;
    const title = normalize(titleOf(item));
    const original = normalize(item?.original_title || item?.original_name || '');
    const year = yearOf(item);
    const hay = normalize([
      title,
      original,
      item?.overview,
      item?.description,
      item?.genre,
      ...asArray(item?.genres),
      ...asArray(item?.cast),
      ...asArray(item?.cast_members),
      item?.language,
      item?.country
    ].join(' '));

    let score = 0;
    if (title === q || original === q) score += 1000;
    if (title.startsWith(q)) score += 500;
    if (title.includes(q)) score += 300;
    if (original.includes(q)) score += 240;
    if (hay.includes(` ${q} `)) score += 180;
    if (year === q) score += 420;

    const qt = tokens(q);
    const tt = tokens(title);
    const ht = tokens(hay);
    let titleHits = 0;
    let broadHits = 0;
    qt.forEach(t => {
      if (tt.includes(t)) titleHits += 1;
      else if (ht.some(h => h === t || h.startsWith(t))) broadHits += 1;
    });
    score += titleHits * 130 + broadHits * 25;
    if (item?.rating) score += Math.min(25, Number(item.rating) || 0);
    return score;
  }

  function findInput() {
    const inputs = [...document.querySelectorAll('input, textarea')];
    return inputs.find(el => {
      const p = `${el.placeholder || ''} ${el.getAttribute('aria-label') || ''}`.toLowerCase();
      return p.includes('search') || p.includes('movie') || p.includes('series');
    }) || null;
  }

  function setReactInputValue(input, value) {
    if (!input) return;
    const proto = Object.getPrototypeOf(input);
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor?.set) descriptor.set.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
  }

  function ensureSearchPanel(input) {
    if (!input) return null;
    let panel = document.querySelector('.cu-search-panel');
    if (panel && panel.dataset.forInput === String([...document.querySelectorAll('input,textarea')].indexOf(input))) return panel;

    panel?.remove();
    panel = document.createElement('div');
    panel.className = 'cu-search-panel';
    panel.dataset.forInput = String([...document.querySelectorAll('input,textarea')].indexOf(input));
    panel.innerHTML = '<div class="cu-search-head"><div class="cu-search-title">Cine Universe Search</div><div class="cu-search-count"></div></div><div class="cu-search-results"></div>';

    const anchor = input.closest('form, .search-box, .search-wrap, .search-container, section, header') || input.parentElement;
    (anchor || input).insertAdjacentElement('afterend', panel);
    return panel;
  }

  function hideSearchPanel() {
    const panel = document.querySelector('.cu-search-panel');
    if (panel) panel.remove();
  }

  async function renderSearch(query) {
    const input = findInput();
    if (!input) return;
    if (!query.trim()) { hideSearchPanel(); return; }
    const all = catalogLoaded ? [...movieCatalog.map(x => ({ ...x, __kind: 'Movie', mediaType: 'movie' })), ...tvCatalog.map(x => ({ ...x, __kind: 'TV Series', mediaType: 'tv' }))] : await loadCatalog();
    const ranked = all
      .map(item => ({ item, score: searchScore(item, query) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score || titleOf(a.item).localeCompare(titleOf(b.item)))
      .slice(0, 12)
      .map(x => x.item);

    const panel = ensureSearchPanel(input);
    if (!panel) return;
    const count = panel.querySelector('.cu-search-count');
    const results = panel.querySelector('.cu-search-results');
    count.textContent = `${ranked.length} result${ranked.length === 1 ? '' : 's'}`;
    if (!ranked.length) {
      results.innerHTML = '<div class="cu-search-empty">No matching movies or TV series found.</div>';
      return;
    }

    results.innerHTML = ranked.map((item, index) => {
      const poster = posterOf(item);
      const type = item.__kind || (item.type === 'TV Series' ? 'TV Series' : 'Movie');
      return `<div class="cu-result" data-cu-search-index="${index}">
        <div class="cu-result-poster">${poster ? `<img src="${poster.replace(/"/g, '&quot;')}" alt="">` : `<div class="cu-result-fallback">${titleOf(item).replace(/</g, '&lt;')}</div>`}</div>
        <div class="cu-result-body">
          <div class="cu-result-name">${titleOf(item).replace(/</g, '&lt;')}</div>
          <div class="cu-result-meta">${yearOf(item)} · ★ ${ratingOf(item)}</div>
          <div class="cu-result-badge">${type}</div>
        </div>
      </div>`;
    }).join('');

    [...results.querySelectorAll('.cu-result')].forEach((el, index) => {
      el.addEventListener('click', () => {
        const item = ranked[index];
        const title = titleOf(item);
        setReactInputValue(input, title);
        hideSearchPanel();
        setTimeout(() => {
          const candidates = [...document.querySelectorAll('button, [role="button"], article, .card, .movie-card, .series-card')];
          const target = candidates.find(node => normalize(node.textContent).includes(normalize(title)));
          target?.click?.();
        }, 100);
      });
    });
  }

  function wireSearch() {
    const input = findInput();
    if (!input || input.dataset.cuV2Bound === '1') return;
    input.dataset.cuV2Bound = '1';
    input.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => renderSearch(input.value || ''), 90);
    });
    input.addEventListener('focus', () => {
      if (input.value.trim()) renderSearch(input.value);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideSearchPanel();
    });
  }

  function categoryInfo(item) {
    const text = normalize([
      item?.country,
      item?.origin_country,
      item?.language,
      item?.original_language,
      item?.genre,
      item?.category,
      ...asArray(item?.genres),
      ...asArray(item?.countries),
      ...asArray(item?.languages)
    ].join(' '));

    const isAnime = /(^|\s)(anime|animation|animated)(\s|$)/.test(text) || /japan japanese/.test(text) || /\banime\b/.test(text);
    const isKorean = /korea|south korea|korean|\bkr\b|\bko\b/.test(text);
    const isIndian = /india|indian|hindi|tamil|telugu|malayalam|kannada|bengali|marathi|punjabi|gujarati|urdu|\bhi\b|\bta\b|\bte\b|\bml\b|\bkn\b|\bbn\b|\bmr\b|\bpa\b|\bgu\b/.test(text);

    if (isAnime) return 'Anime';
    if (isIndian) return 'Indian';
    if (isKorean) return 'Korean';
    return 'International';
  }

  function countSet(list) {
    const out = { total: list.length, movies: 0, tv: 0 };
    list.forEach(item => {
      if (item.__kind === 'TV Series' || item.mediaType === 'tv' || item.type === 'TV Series') out.tv += 1;
      else out.movies += 1;
    });
    return out;
  }

  function makeCard(label, stat) {
    return `<div class="cu-admin-stat-card"><div class="cu-admin-stat-title">${label}</div><div class="cu-admin-stat-total">${stat.total}</div><div class="cu-admin-stat-row"><span>Movies</span><strong>${stat.movies}</strong></div><div class="cu-admin-stat-row"><span>TV Series</span><strong>${stat.tv}</strong></div><div class="cu-admin-stat-note">Uploaded content</div></div>`;
  }

  function findAdminAnchor() {
    const visible = (el) => {
      if (!el) return false;
      const s = getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && el.getClientRects().length > 0;
    };
    const nodes = [...document.querySelectorAll('h1,h2,h3,h4,h5,strong,b,div,section')];
    return nodes.find(el => visible(el) && /^admin(\s+panel)?$/i.test(String(el.textContent || '').trim())) ||
      nodes.find(el => visible(el) && /admin panel/i.test(String(el.textContent || '').trim())) || null;
  }

  function renderAdminStats() {
    const anchor = findAdminAnchor();
    if (!anchor || !catalogLoaded) return;
    let shell = document.querySelector('.cu-admin-stats-shell');
    if (!shell || !anchor.parentElement?.contains(shell)) {
      shell?.remove();
      shell = document.createElement('div');
      shell.className = 'cu-admin-stats-shell';
      shell.innerHTML = '<div class="cu-admin-stats-label">Uploaded Content by Category</div>';
      anchor.insertAdjacentElement('afterend', shell);
    }

    const all = [
      ...movieCatalog.map(x => ({ ...x, __kind: 'Movie', mediaType: 'movie' })),
      ...tvCatalog.map(x => ({ ...x, __kind: 'TV Series', mediaType: 'tv' }))
    ];
    const groups = { Indian: [], Korean: [], Anime: [], International: [] };
    all.forEach(item => groups[categoryInfo(item)].push(item));
    const cards = [
      ['Indian', countSet(groups.Indian)],
      ['Korean', countSet(groups.Korean)],
      ['Anime', countSet(groups.Anime)],
      ['International', countSet(groups.International)],
      ['All Content', countSet(all)]
    ];
    shell.innerHTML = '<div class="cu-admin-stats-label">Uploaded Content by Category</div>' + cards.map(([label, stat]) => makeCard(label, stat)).join('');
  }

  async function refreshAll() {
    await loadCatalog();
    wireSearch();
    renderAdminStats();
  }

  function bootObserver() {
    const observer = new MutationObserver(() => {
      wireSearch();
      renderAdminStats();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(() => { wireSearch(); renderAdminStats(); }, 2500);
    setInterval(() => refreshAll(), 15000);
  }

  refreshAll().catch(() => {});
  bootObserver();
})();
