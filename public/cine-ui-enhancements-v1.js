(() => {
  'use strict';
  const state = { cache: null, timer: null, panel: null, lastQuery: '' };
  const API = '/api';
  const text = v => String(v ?? '').trim();
  const lower = v => text(v).toLowerCase();
  const esc = v => text(v).replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
  const normalize = v => lower(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[’'`]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  const mediaType = item => item?.mediaType || (item?.type === 'TV Series' ? 'tv' : 'movie');

  async function loadCatalog(force=false) {
    if(state.cache && !force) return state.cache;
    try {
      const [m,tv] = await Promise.all([
        fetch(`${API}/catalog?ui=${Date.now()}`,{cache:'no-store'}).then(r=>r.ok?r.json():{results:[]}),
        fetch(`${API}/tv-catalog?ui=${Date.now()}`,{cache:'no-store'}).then(r=>r.ok?r.json():{results:[]})
      ]);
      const movies=Array.isArray(m?.results)?m.results.map(x=>({...x,mediaType:'movie',type:x.type||'Movie'})):[];
      const series=Array.isArray(tv?.results)?tv.results.map(x=>({...x,mediaType:'tv',type:x.type||'TV Series'})):[];
      state.cache=[...movies,...series];
      return state.cache;
    } catch { return []; }
  }

  function fuzzyScore(title,query,year=''){
    const t=normalize(title),q=normalize(query); if(!t||!q)return 0;
    const qt=q.split(' ').filter(Boolean),tt=t.split(' ').filter(Boolean); let score=0,hits=0;
    if(t===q)score+=1200; if(t.startsWith(q))score+=550; if(t.includes(q))score+=300;
    for(const token of qt){if(tt.includes(token)){score+=90;hits++}else if(t.includes(token)){score+=35;hits++}}
    if(qt.length&&hits===qt.length)score+=220; if(qt.length&&hits/qt.length>=.75)score+=120;
    if(text(year)&&q.includes(text(year)))score+=80;
    return score;
  }
  async function searchRemote(q){try{const r=await fetch(`${API}/search?q=${encodeURIComponent(q)}`,{cache:'no-store'});return r.ok?((await r.json())?.results||[]):[]}catch{return[]}}
  function mergeResults(remote,local,q){
    const out=[],seen=new Set();
    for(const item of [...remote,...local]){
      const kind=mediaType(item),id=item?.id,key=`${kind}:${id}`;
      if(!id||seen.has(key))continue; seen.add(key);
      const s=fuzzyScore(item.title,q,item.year)+Number(item?.popularity||0)*0.03;
      if(s>20)out.push({...item,mediaType:kind,score:s});
    }
    return out.sort((a,b)=>b.score-a.score).slice(0,12);
  }
  function ensurePanel(){if(state.panel?.isConnected)return state.panel;const p=document.createElement('div');p.className='search-enhanced-panel';p.hidden=true;document.body.appendChild(p);state.panel=p;return p}
  function hidePanel(){if(state.panel){state.panel.hidden=true;state.panel.innerHTML=''}}
  function renderSearchResults(q,results){
    const p=ensurePanel(); if(!text(q)){hidePanel();return} p.hidden=false;
    if(!results.length){p.innerHTML=`<div class="search-enhanced-head"><b>Search results</b><span>No match</span></div><div class="search-enhanced-empty">No matching published title found. Try the full name or year.</div>`;return}
    p.innerHTML=`<div class="search-enhanced-head"><b>Best matches for “${esc(q)}”</b><span>${results.length} results</span></div>`+results.map(item=>{
      const poster=text(item.poster||item.posterUrl||(item.poster_path?`https://image.tmdb.org/t/p/w500${item.poster_path}`:''));
      const kind=mediaType(item)==='tv'?'TV Series':'Movie';
      return `<button class="search-enhanced-item" type="button" data-search-target="?movie=${encodeURIComponent(item.id)}"><span class="search-enhanced-poster">${poster?`<img src="${esc(poster)}" alt="" loading="lazy" decoding="async">`:''}</span><span class="search-enhanced-main"><strong>${esc(item.title||'Untitled')}</strong><small>${kind}${item.year?` • ${esc(item.year)}`:''}${item.rating?` • ⭐ ${esc(item.rating)}`:''}</small></span><span class="search-enhanced-badge">Open ›</span></button>`;
    }).join('');
  }
  async function runSearch(input){const q=text(input?.value);if(!q){hidePanel();return}state.lastQuery=q;const [remote,local]=await Promise.all([searchRemote(q),loadCatalog()]);if(state.lastQuery!==q)return;renderSearchResults(q,mergeResults(remote,local,q))}
  function bindSearch(){
    const input=document.querySelector('.search-wrap input'); if(!input||input.dataset.cineEnhanced==='1')return;
    input.dataset.cineEnhanced='1';
    input.addEventListener('input',()=>{clearTimeout(state.timer);state.timer=setTimeout(()=>runSearch(input),220)});
    input.addEventListener('focus',()=>{if(text(input.value))runSearch(input)});
    document.addEventListener('click',e=>{const target=e.target.closest?.('[data-search-target]');if(target){const url=target.getAttribute('data-search-target');if(url)window.location.href=url;return}if(!e.target.closest?.('.search-enhanced-panel,.search-wrap'))hidePanel()});
  }

  function countryValue(x){return [x?.country,x?.countryCode,x?.country_code,x?.originalCountry,x?.original_country,...(Array.isArray(x?.originCountry)?x.originCountry:[]),...(Array.isArray(x?.productionCountries)?x.productionCountries:[]),...(Array.isArray(x?.production_countries)?x.production_countries:[])].filter(Boolean).map(v=>typeof v==='string'?v:(v.code||v.iso_3166_1||v.iso||v.name||'')).join(' ').toLowerCase()}
  function lang(x){return lower(x?.originalLanguage||x?.original_language||x?.language)}
  function genres(x){return (Array.isArray(x?.genres)?x.genres:[]).map(g=>lower(typeof g==='string'?g:g?.name)).join(' ')}
  function isAnime(x){return lang(x)==='ja'||/\banime\b|animation/.test(genres(x))||/\banime\b/.test(lower(x?.title))}
  function isIndian(x){return /\b(india|indian)\b/.test(countryValue(x))||['hi','ta','te','ml','kn','bn','mr','pa','gu','ur'].includes(lang(x))}
  function isKorean(x){return /\b(korea|south korea|korean)\b/.test(countryValue(x))||lang(x)==='ko'}
  function classify(items){const out={india:[],korea:[],anime:[],international:[]};for(const x of items){if(isAnime(x))out.anime.push(x);else if(isIndian(x))out.india.push(x);else if(isKorean(x))out.korea.push(x);else out.international.push(x)}return out}
  function counts(arr){return{total:arr.length,movies:arr.filter(x=>mediaType(x)==='movie').length,tv:arr.filter(x=>mediaType(x)==='tv').length}}
  function statCard(icon,title,c,cls){return `<div class="admin-stat-card ${cls||''}"><span class="admin-stat-icon">${icon}</span><strong>${title}</strong><b>${c.total}</b><div class="admin-stat-breakdown"><span>🎬 ${c.movies} Movies</span><span>📺 ${c.tv} TV Series</span></div></div>`}

  async function renderAdminStats(){
    const admin=document.querySelector('.admin-page'); if(!admin)return;
    const layout=admin.querySelector('.admin-layout'); if(!layout)return;
    let shell=admin.querySelector('.admin-stats-shell');
    if(!shell){shell=document.createElement('div');shell.className='admin-stats-shell';layout.parentElement?.insertBefore(shell,layout)}
    const items=await loadCatalog(true),groups=classify(items);
    shell.innerHTML=[
      statCard('🇮🇳','Indian',counts(groups.india),'india'),
      statCard('🇰🇷','Korean',counts(groups.korea),'korea'),
      statCard('🎌','Anime',counts(groups.anime),'anime'),
      statCard('🌍','International',counts(groups.international),'international'),
      statCard('🎬','All Content',counts(items),'all')
    ].join('');
  }

  function watchAdmin(){
    let queued=false;
    const run=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;if(document.querySelector('.admin-page'))renderAdminStats()})};
    run();
    new MutationObserver(run).observe(document.body,{childList:true,subtree:true});
    setInterval(()=>{if(document.querySelector('.admin-page'))renderAdminStats()},15000);
  }
  function init(){bindSearch();watchAdmin()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
