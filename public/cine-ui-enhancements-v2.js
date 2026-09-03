(() => {
  'use strict';
  if (window.__CINE_UNIVERSE_UI_V2__) return;
  window.__CINE_UNIVERSE_UI_V2__ = true;

  const API='/api';
  const state={cache:null,lastQuery:'',searchTimer:null};
  const text=v=>String(v??'').trim();
  const lower=v=>text(v).toLowerCase();
  const esc=v=>text(v).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
  const normalize=v=>lower(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[’'`]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();

  async function loadCatalog(){
    try{
      const [m,t]=await Promise.all([
        fetch(`${API}/catalog?ui=${Date.now()}`,{cache:'no-store'}).then(r=>r.ok?r.json():{results:[]}),
        fetch(`${API}/tv-catalog?ui=${Date.now()}`,{cache:'no-store'}).then(r=>r.ok?r.json():{results:[]})
      ]);
      const movies=Array.isArray(m?.results)?m.results.map(x=>({...x,mediaType:'movie',type:x.type||'Movie'})):[];
      const tv=Array.isArray(t?.results)?t.results.map(x=>({...x,mediaType:'tv',type:x.type||'TV Series'})):[];
      state.cache=[...movies,...tv];
      return state.cache;
    }catch{return []}
  }

  function score(item,query){
    const t=normalize(item?.title||''),q=normalize(query||'');
    if(!t||!q)return 0;
    let s=Number(item?.popularity||0)*0.05;
    if(t===q)s+=1200;
    if(t.startsWith(q))s+=550;
    if(t.includes(q))s+=300;
    const qt=q.split(' ').filter(x=>x.length>1),tt=t.split(' ');
    let hits=0;
    for(const token of qt){if(tt.includes(token)){s+=90;hits++}else if(t.includes(token)){s+=35;hits++}}
    if(qt.length&&hits===qt.length)s+=220;
    if(qt.length&&hits/qt.length>=.75)s+=120;
    const year=text(item?.year); if(year&&q.includes(year))s+=80;
    return s;
  }

  async function search(query){
    const q=text(query); if(!q)return [];
    const localPromise=loadCatalog();
    const remotePromise=(async()=>{try{const r=await fetch(`${API}/search?q=${encodeURIComponent(q)}`,{cache:'no-store'});return r.ok?(await r.json())?.results||[]:[]}catch{return []}})();
    const [local,remote]=await Promise.all([localPromise,remotePromise]);
    const seen=new Set(),out=[];
    for(const item of [...remote,...local]){
      const mediaType=item?.mediaType||(item?.type==='TV Series'?'tv':'movie');
      const id=item?.id;
      const key=`${mediaType}:${id}`;
      if(!id||seen.has(key))continue;
      seen.add(key);
      const sc=score(item,q);
      if(sc>20)out.push({...item,mediaType,score:sc});
    }
    return out.sort((a,b)=>b.score-a.score).slice(0,12);
  }

  function panel(){
    let p=document.querySelector('.cu-search-panel');
    if(!p){p=document.createElement('div');p.className='cu-search-panel';p.hidden=true;document.body.appendChild(p)}
    return p;
  }
  function renderSearch(query,results){
    const p=panel();
    if(!text(query)){p.hidden=true;p.innerHTML='';return}
    p.hidden=false;
    if(!results.length){p.innerHTML=`<div class="cu-search-head"><b>Search results</b><span>No match</span></div><div class="cu-search-empty">No matching published title found. Try the full name or year.</div>`;return}
    p.innerHTML=`<div class="cu-search-head"><b>Best matches for “${esc(query)}”</b><span>${results.length} results</span></div>`+results.map(item=>{
      const poster=text(item.poster||item.posterUrl||(item.poster_path?`https://image.tmdb.org/t/p/w500${item.poster_path}`:''));
      const kind=item.mediaType==='tv'||item.type==='TV Series'?'TV Series':'Movie';
      const url=`?movie=${encodeURIComponent(item.id)}`;
      return `<button class="cu-search-item" type="button" data-cu-search-target="${esc(url)}"><span class="cu-search-poster">${poster?`<img src="${esc(poster)}" alt="" loading="lazy" decoding="async">`:''}</span><span class="cu-search-main"><strong>${esc(item.title||'Untitled')}</strong><small>${esc(kind)}${item.year?` • ${esc(item.year)}`:''}${item.rating?` • ⭐ ${esc(item.rating)}`:''}</small></span><span class="cu-search-badge">Open ›</span></button>`;
    }).join('');
  }
  function bindSearch(){
    const input=document.querySelector('.search-wrap input');
    if(!input||input.dataset.cuSearchV2==='1')return;
    input.dataset.cuSearchV2='1';
    input.addEventListener('input',()=>{clearTimeout(state.searchTimer);state.searchTimer=setTimeout(async()=>{const q=text(input.value);state.lastQuery=q;renderSearch(q,await search(q));},180)});
    input.addEventListener('focus',async()=>{const q=text(input.value);if(q)renderSearch(q,await search(q))});
    document.addEventListener('click',e=>{
      const target=e.target.closest?.('[data-cu-search-target]');
      if(target){const u=target.getAttribute('data-cu-search-target');if(u)window.location.href=u;return}
      if(!e.target.closest?.('.cu-search-panel,.search-wrap')){const p=document.querySelector('.cu-search-panel');if(p)p.hidden=true}
    });
  }

  function countryValue(x){
    return [x?.country,x?.countryCode,x?.country_code,x?.originalCountry,x?.original_country,
      ...(Array.isArray(x?.originCountry)?x.originCountry:[]),...(Array.isArray(x?.productionCountries)?x.productionCountries:[]),
      ...(Array.isArray(x?.production_countries)?x.production_countries:[])].filter(Boolean).map(v=>typeof v==='string'?v:(v.code||v.iso_3166_1||v.iso||v.name||'')).join(' ').toLowerCase();
  }
  function lang(x){return lower(x?.originalLanguage||x?.original_language||x?.language)}
  function genres(x){return (Array.isArray(x?.genres)?x.genres:[]).map(g=>lower(typeof g==='string'?g:g?.name)).join(' ')}
  function isAnime(x){return lang(x)==='ja'||/\banime\b|animation/.test(genres(x))||/\banime\b/.test(lower(x?.title))}
  function isIndian(x){return /\b(india|indian|in)\b/.test(countryValue(x))||['hi','ta','te','ml','kn','bn','mr','pa','gu','ur'].includes(lang(x))}
  function isKorean(x){return /\b(korea|south korea|korean|kr)\b/.test(countryValue(x))||lang(x)==='ko'}
  function mediaType(x){return x?.mediaType||(x?.type==='TV Series'?'tv':'movie')}

  function renderStats(items){
    const admin=document.querySelector('.admin-page');
    if(!admin)return;
    const layout=admin.querySelector('.admin-layout');
    if(!layout)return;
    let shell=admin.querySelector('.cu-admin-stats-shell');
    if(!shell){shell=document.createElement('div');shell.className='cu-admin-stats-shell';layout.parentElement?.insertBefore(shell,layout)}
    const groups={india:[],korea:[],anime:[],international:[]};
    for(const x of items){if(isAnime(x))groups.anime.push(x);else if(isIndian(x))groups.india.push(x);else if(isKorean(x))groups.korea.push(x);else groups.international.push(x)}
    const count=arr=>({total:arr.length,movies:arr.filter(x=>mediaType(x)==='movie').length,tv:arr.filter(x=>mediaType(x)==='tv').length});
    const card=(icon,title,data,cls)=>`<div class="cu-admin-stat-card ${cls}"><span class="cu-stat-icon">${icon}</span><strong>${title}</strong><b>${data.total}</b><div class="cu-stat-breakdown"><span>🎬 ${data.movies} Movies</span><span>📺 ${data.tv} TV Series</span></div></div>`;
    shell.innerHTML=[
      card('🇮🇳','Indian',count(groups.india),'india'),
      card('🇰🇷','Korean',count(groups.korea),'korea'),
      card('🎌','Anime',count(groups.anime),'anime'),
      card('🌍','International',count(groups.international),'international'),
      card('🎬','All Content',count(items),'all')
    ].join('');
  }

  async function refreshStats(){state.cache=null;renderStats(await loadCatalog())}
  function watchAdmin(){
    const run=()=>{if(document.querySelector('.admin-page'))refreshStats()};
    run();
    let pending=false;
    new MutationObserver(()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;run()})}).observe(document.body,{childList:true,subtree:true});
    setInterval(()=>{if(document.querySelector('.admin-page'))refreshStats()},15000);
  }

  function init(){bindSearch();watchAdmin()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
