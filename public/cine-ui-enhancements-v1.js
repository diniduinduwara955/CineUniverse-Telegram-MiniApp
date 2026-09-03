(() => {
  'use strict';
  const state = { cache: null, timer: null, panel: null, lastQuery: '', stats: null };
  const API = '/api';

  const text = (v) => String(v ?? '').trim();
  const lower = (v) => text(v).toLowerCase();
  const esc = (v) => text(v).replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
  const normalize = (v) => lower(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/['’`]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();

  function fuzzyScore(title, query, year='') {
    const t = normalize(title), q = normalize(query);
    if (!t || !q) return 0;
    const qt = q.split(' ').filter(Boolean), tt = t.split(' ').filter(Boolean);
    let score = 0;
    if (t === q) score += 1000;
    if (t.startsWith(q)) score += 500;
    if (t.includes(q)) score += 280;
    let hits = 0;
    for (const token of qt) {
      if (tt.includes(token)) { score += 90; hits++; }
      else if (t.includes(token)) { score += 35; hits++; }
    }
    if (qt.length && hits === qt.length) score += 180;
    if (qt.length && hits / qt.length >= .75) score += 100;
    const normalizedYear = text(year);
    if (normalizedYear && q.includes(normalizedYear)) score += 70;
    return score;
  }

  async function loadCatalog() {
    if (state.cache) return state.cache;
    try {
      const [m, tv] = await Promise.all([
        fetch(`${API}/catalog`, {cache:'no-store'}).then(r => r.ok ? r.json() : {results:[]}),
        fetch(`${API}/tv-catalog`, {cache:'no-store'}).then(r => r.ok ? r.json() : {results:[]})
      ]);
      const movies = Array.isArray(m?.results) ? m.results.map(x => ({...x, mediaType:'movie', type:x.type||'Movie'})) : [];
      const series = Array.isArray(tv?.results) ? tv.results.map(x => ({...x, mediaType:'tv', type:x.type||'TV Series'})) : [];
      state.cache = [...movies, ...series];
      return state.cache;
    } catch {
      return [];
    }
  }

  async function searchRemote(query) {
    try {
      const r = await fetch(`${API}/search?q=${encodeURIComponent(query)}`, {cache:'no-store'});
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data?.results) ? data.results : [];
    } catch { return []; }
  }

  function mergeResults(remote, local, query) {
    const all = [];
    const seen = new Set();
    for (const item of [...remote, ...local]) {
      const id = `${item?.mediaType || (item?.type === 'TV Series' ? 'tv' : 'movie')}:${item?.id}`;
      if (!item?.id || seen.has(id)) continue;
      seen.add(id);
      const score = fuzzyScore(item.title, query, item.year);
      if (score > 0) all.push({...item, score});
    }
    return all.sort((a,b) => b.score-a.score || Number(b.popularity||0)-Number(a.popularity||0)).slice(0,12);
  }

  function ensurePanel() {
    if (state.panel?.isConnected) return state.panel;
    const p = document.createElement('div');
    p.className = 'search-enhanced-panel';
    p.hidden = true;
    document.body.appendChild(p);
    state.panel = p;
    return p;
  }

  function hidePanel() {
    const p = state.panel;
    if (p) { p.hidden = true; p.innerHTML = ''; }
  }

  function renderSearchResults(query, results) {
    const p = ensurePanel();
    if (!text(query)) { hidePanel(); return; }
    p.hidden = false;
    if (!results.length) {
      p.innerHTML = `<div class="search-enhanced-head"><b>Search results</b><span>No match</span></div><div class="search-enhanced-empty">No published title matched “${esc(query)}”. Try the full movie/series name or year.</div>`;
      return;
    }
    p.innerHTML = `<div class="search-enhanced-head"><b>Best matches for “${esc(query)}”</b><span>${results.length} results</span></div>` + results.map(item => {
      const poster = text(item.poster || item.posterUrl || (item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : ''));
      const kind = item.type === 'TV Series' || item.mediaType === 'tv' ? 'TV Series' : 'Movie';
      const url = `?movie=${encodeURIComponent(item.id)}`;
      return `<button class="search-enhanced-item" type="button" data-search-target="${esc(url)}"><span class="search-enhanced-poster">${poster ? `<img src="${esc(poster)}" alt="" loading="lazy">` : ''}</span><span class="search-enhanced-main"><strong>${esc(item.title || 'Untitled')}</strong><small>${esc(kind)}${item.year ? ` • ${esc(item.year)}` : ''}${item.rating ? ` • ⭐ ${esc(item.rating)}` : ''}</small></span><span class="search-enhanced-badge">Open ›</span></button>`;
    }).join('');
  }

  async function runSearch(input) {
    const query = text(input?.value);
    if (!query) { hidePanel(); return; }
    state.lastQuery = query;
    const [remote, local] = await Promise.all([searchRemote(query), loadCatalog()]);
    if (state.lastQuery !== query) return;
    renderSearchResults(query, mergeResults(remote, local, query));
  }

  function bindSearch() {
    const input = document.querySelector('.search-wrap input');
    if (!input || input.dataset.cineEnhanced === '1') return;
    input.dataset.cineEnhanced = '1';
    input.addEventListener('input', () => {
      clearTimeout(state.timer);
      state.timer = setTimeout(() => runSearch(input), 220);
    }, {capture:false});
    input.addEventListener('focus', () => { if (text(input.value)) runSearch(input); });
    document.addEventListener('click', (e) => {
      const target = e.target.closest?.('[data-search-target]');
      if (target) {
        const url = target.getAttribute('data-search-target');
        if (url) window.location.href = url;
        return;
      }
      if (!e.target.closest?.('.search-enhanced-panel,.search-wrap')) hidePanel();
    });
  }

  function countryValue(x) {
    return [x?.country,x?.countryCode,x?.country_code,x?.originalCountry,x?.original_country,
      ...(Array.isArray(x?.originCountry)?x.originCountry:[]), ...(Array.isArray(x?.original_country)?x.original_country:[]),
      ...(Array.isArray(x?.productionCountries)?x.productionCountries:[]), ...(Array.isArray(x?.production_countries)?x.production_countries:[])]
      .filter(Boolean).map(v => typeof v === 'string' ? v : (v.code || v.iso_3166_1 || v.iso || v.name || '')).join(' ').toLowerCase();
  }
  function languageValue(x) { return lower(x?.originalLanguage || x?.original_language || x?.language); }
  function genresValue(x) { return (Array.isArray(x?.genres) ? x.genres : []).map(g => lower(typeof g === 'string' ? g : g?.name)).join(' '); }
  function isIndian(x) { return /\b(india|indian|in)\b/.test(countryValue(x)) || ['hi','ta','te','ml','kn','bn','mr','pa','gu','ur'].includes(languageValue(x)); }
  function isKorean(x) { return /\b(korea|south korea|korean|kr)\b/.test(countryValue(x)) || languageValue(x) === 'ko'; }
  function isAnime(x) { return languageValue(x) === 'ja' || /anime|animation/.test(genresValue(x)) || /\banime\b/.test(lower(x?.title)); }

  function classify(items) {
    const out = {india:[], korea:[], anime:[], international:[]};
    for (const x of items) {
      if (isAnime(x)) out.anime.push(x);
      else if (isIndian(x)) out.india.push(x);
      else if (isKorean(x)) out.korea.push(x);
      else out.international.push(x);
    }
    return out;
  }

  function statCard(icon, title, total, movies, tv, cls) {
    return `<div class="admin-stat-card ${cls||''}"><span class="admin-stat-icon">${icon}</span><strong>${title}</strong><b>${total}</b><small>${movies} Movies • ${tv} TV Series</small></div>`;
  }

  function findAdminSection() { return document.querySelector('.admin-page'); }

  async function renderAdminStats() {
    const admin = findAdminSection();
    if (!admin) return;
    const layout = admin.querySelector('.admin-layout');
    if (!layout) return;
    let shell = admin.querySelector('.admin-stats-shell');
    if (!shell) {
      shell = document.createElement('div');
      shell.className = 'admin-stats-shell';
      layout.parentElement?.insertBefore(shell, layout);
    }
    const items = await loadCatalog();
    const c = classify(items);
    const count = arr => [arr.length, arr.filter(x => (x.mediaType || (x.type === 'TV Series' ? 'tv' : 'movie')) === 'movie').length, arr.filter(x => (x.mediaType || (x.type === 'TV Series' ? 'tv' : 'movie')) === 'tv').length];
    const [total,movies,tv] = count(items);
    const [it,im,iv] = count(c.india), [kt,km,kv] = count(c.korea), [at,am,av] = count(c.anime), [xt,xm,xv] = count(c.international);
    shell.innerHTML = [
      statCard('🇮🇳','Indian',it,im,iv,'india'),
      statCard('🇰🇷','Korean',kt,km,kv,'korea'),
      statCard('🎌','Anime',at,am,av,'anime'),
      statCard('🌍','International',xt,xm,xv,'international'),
      statCard('🎬','All Content',total,movies,tv,'all'),
      statCard('📚','Total Published',total,movies,tv,'all')
    ].join('');
  }

  function watchAdmin() {
    const run = () => {
      if (findAdminSection()) renderAdminStats();
    };
    run();
    const observer = new MutationObserver(() => run());
    observer.observe(document.body, {childList:true, subtree:true});
    setInterval(() => {
      state.cache = null;
      if (findAdminSection()) renderAdminStats();
    }, 30000);
  }

  function init() {
    bindSearch();
    watchAdmin();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
