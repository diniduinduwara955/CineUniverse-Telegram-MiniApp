import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";
const DEFAULT_CONFIG = {
  channelUrl: "https://t.me/dinidu20030304",
  botUrl: "https://t.me/CINE_UNIVERSE_OFFCIALS_BOT",
  appName: "Cine Universe",
  developer: "Dinidu Induwara",
  facebookPageUrl: "https://www.facebook.com/CineUniverse"
};
const FALLBACK = [
  { id: 1, title: "John Wick: Chapter 4", year: "2023", rating: "8.2", type: "Movie", genres: ["Action", "Thriller", "Crime"], quality: "4K", poster: "", backdrop: "", description: "Premium demo data. Connect TMDB to load live cinematic images." },
  { id: 2, title: "Oppenheimer", year: "2023", rating: "8.7", type: "Movie", genres: ["Biography", "Drama", "History"], quality: "4K", poster: "", backdrop: "", description: "Premium demo data. Connect TMDB to load live cinematic images." },
  { id: 3, title: "Dune: Part Two", year: "2024", rating: "8.5", type: "Movie", genres: ["Sci-Fi", "Adventure", "Drama"], quality: "4K", poster: "", backdrop: "", description: "Premium demo data. Connect TMDB to load live cinematic images." },
  { id: 4, title: "Game of Thrones", year: "2011–2019", rating: "9.2", type: "TV Series", genres: ["Drama", "Fantasy", "Action"], quality: "4K", poster: "", backdrop: "", description: "Premium demo data. Connect TMDB to load live cinematic images." }
];
const GENRES = [["Action","✦","red"],["Adventure","◆","gold"],["Sci-Fi","✧","purple"],["Thriller","◈","blue"],["Drama","●","yellow"],["Comedy","☺","green"]];
const QUALITY = [["4K Ultra HD","2160p • HEVC","4K","gold"],["1080P Full HD","1920p • H.264","1080P","blue"],["720P HD","1280p • H.264","720P","green"],["480P","854p • H.264","480P","silver"]];
const QUALITY_META = Object.fromEntries(QUALITY.map(([name, meta, key, tone]) => [key, {name, meta, tone}]));

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `API error ${res.status}`);
  return data;
}
function loadConfig(){ try{return {...DEFAULT_CONFIG,...JSON.parse(localStorage.getItem("cine-config")||"{}")}}catch{return DEFAULT_CONFIG} }
function vibrate(type="success"){ try{window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(type)}catch{} }

function Icon({name,size=20}){
  const p={width:size,height:size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round",strokeLinejoin:"round"};
  const I={
    search:<><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></>,home:<><path d="m3 10.8 9-7 9 7"/><path d="M5 9.7V20h14V9.7"/><path d="M10 20v-6h4v6"/></>,film:<><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 3v18M16 3v18M4 8h4M12 8h4M4 16h4M12 16h4"/></>,tv:<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m8 2 4 3 4-3"/></>,heart:<path d="M20.8 8.8c0 5.4-8.8 10.2-8.8 10.2S3.2 14.2 3.2 8.8A5.1 5.1 0 0 1 8.4 4a5.4 5.4 0 0 1 3.6 1.5A5.4 5.4 0 0 1 15.6 4a5.1 5.1 0 0 1 5.2 4.8Z"/>,download:<><path d="M12 3v11"/><path d="m7 10 5 5 5-5"/><path d="M4 19h16"/></>,settings:<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-2.6v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H4.2v-2.6h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V4.2h2.6v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2v2.6h-.2a1.7 1.7 0 0 0-1.5 1Z"/></>,user:<><circle cx="12" cy="8" r="3"/><path d="M5 20c.6-3.2 3-5 7-5s6.4 1.8 7 5"/></>,plus:<><path d="M12 5v14M5 12h14"/></>,youtube:<><path d="M22 12s0-3.3-.42-4.9a2.7 2.7 0 0 0-1.9-1.9C18.1 4.8 12 4.8 12 4.8s-6.1 0-7.68.42a2.7 2.7 0 0 0-1.9 1.9C2 8.7 2 12 2 12s0 3.3.42 4.9a2.7 2.7 0 0 0 1.9 1.9c1.58.42 7.68.42 7.68.42s6.1 0 7.68-.42a2.7 2.7 0 0 0 1.9-1.9C22 15.3 22 12 22 12Z"/><path d="m10 9 5 3-5 3Z"/></>,facebook:<><path d="M14 8h3V5.5h-3c-2.5 0-4 1.6-4 4.1V12H7v3h3v4h3v-4h3l.5-3H13V9.8c0-1.1.4-1.8 1-1.8Z"/></>,share:<><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="m16 6-4-4-4 4M12 2v14"/></>,close:<><path d="m6 6 12 12M18 6 6 18"/></>,arrow:<path d="m9 18 6-6-6-6"/>,play:<path d="m9 7 8 5-8 5Z"/>,telegram:<><path d="m21 4-3.7 16-6-5.2-3.8 2.5.9-4.6Z"/><path d="m21 4-9.2 6.4"/></>,bot:<><rect x="5" y="7" width="14" height="11" rx="3"/><path d="M12 4v3M9 12h.01M15 12h.01M8 18v2M16 18v2"/></>,star:<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L2.9 9.6l6.2-.9Z"/>
  }; return <svg {...p}>{I[name]}</svg>
}

function resolveAssetUrl(value){
  const raw=String(value||'').trim();
  if(!raw) return '';
  if(/^https?:\/\//i.test(raw)||raw.startsWith('//')) return raw;
  if(raw.startsWith('/')) return raw;
  return `/${raw.replace(/^\.?\//,'')}`;
}

function Poster({movie,className=""}){
  const candidates=[
    resolveAssetUrl(movie?.poster),
    resolveAssetUrl(movie?.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : ''),
    resolveAssetUrl(movie?.posterUrl)
  ].filter(Boolean);
  const [candidateIndex,setCandidateIndex]=useState(0);
  useEffect(()=>setCandidateIndex(0),[movie?.id,movie?.poster,movie?.poster_path,movie?.posterUrl]);
  const imageUrl=candidates[candidateIndex]||'';
  const showImage=Boolean(imageUrl)&&candidateIndex<candidates.length;
  const handleError=()=>setCandidateIndex(i=>i+1);

  return <div className={`poster ${className} ${showImage?"has-image":"no-image"}`}>
    {showImage && <img className="poster-img" src={imageUrl} alt={`${movie?.title||"Movie"} poster`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={handleError}/>}
    {!showImage && <div className="poster-fallback"><span>{movie?.title||"Untitled"}</span><small>{movie?.year||"—"}</small></div>}
    <div className="poster-vignette"/>
    <div className="rating-pill"><Icon name="star" size={10}/>{movie?.rating||"—"}</div>
    {movie?.quality==="4K"&&<div className="mini-quality">4K</div>}
  </div>
}

function App(){
  const [active,setActive]=useState("Home"); const [query,setQuery]=useState(""); const [hero,setHero]=useState(0); const [toast,setToast]=useState("");
  const [favorites,setFavorites]=useState(()=>JSON.parse(localStorage.getItem("cine-favs")||"[]")); const [downloads,setDownloads]=useState(()=>JSON.parse(localStorage.getItem("cine-downloads")||"[]"));
  const [config,setConfig]=useState(loadConfig); const [trending,setTrending]=useState([]); const [publishedMovies,setPublishedMovies]=useState([]); const [publishedTv,setPublishedTv]=useState([]); const [popularMovies,setPopularMovies]=useState([]); const [popularTv,setPopularTv]=useState([]); const [dramaTv,setDramaTv]=useState([]); const [indianMovies,setIndianMovies]=useState([]); const [indianTv,setIndianTv]=useState([]); const [koreanMovies,setKoreanMovies]=useState([]); const [koreanTv,setKoreanTv]=useState([]);
  const [items,setItems]=useState([]); const [selected,setSelected]=useState(null); const [loading,setLoading]=useState(true); const [detailLoading,setDetailLoading]=useState(false); const [apiError,setApiError]=useState(""); const [genreTitle,setGenreTitle]=useState("");
  const [downloadMap,setDownloadMap]=useState({}); const [downloadLoading,setDownloadLoading]=useState(false);
  const [adminKey,setAdminKey]=useState(()=>sessionStorage.getItem("cine-admin-key")||""); const [adminSearch,setAdminSearch]=useState(""); const [adminResults,setAdminResults]=useState([]); const [adminSelected,setAdminSelected]=useState(null); const [adminMap,setAdminMap]=useState({}); const [adminLoading,setAdminLoading]=useState(false); const [adminMessage,setAdminMessage]=useState(""); const [adminTvInviteUrl,setAdminTvInviteUrl]=useState("");
  const [adminForm,setAdminForm]=useState({quality:"1080P",channel_chat_id:"",channel_message_id:"",tv_invite_url:"",caption:"",size:"",codec:"",audio:""});

  useEffect(()=>{window.Telegram?.WebApp?.ready?.(); window.Telegram?.WebApp?.expand?.(); window.Telegram?.WebApp?.setHeaderColor?.("#05060a"); window.Telegram?.WebApp?.setBackgroundColor?.("#05060a")},[]);
  useEffect(()=>localStorage.setItem("cine-favs",JSON.stringify(favorites)),[favorites]);
  useEffect(()=>localStorage.setItem("cine-downloads",JSON.stringify(downloads)),[downloads]);
  useEffect(()=>localStorage.setItem("cine-config",JSON.stringify(config)),[config]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(""),2400);return()=>clearTimeout(t)},[toast]);

  const notify=(m)=>{setToast(m);vibrate("success")};
  const openChannel=()=>window.open(config.channelUrl,"_blank","noopener,noreferrer");
  const openBot=()=>window.open(config.botUrl,"_blank","noopener,noreferrer");
  const openFacebookPage=()=>{const url=config.facebookPageUrl||"https://www.facebook.com/CineUniverse";window.open(url,"_blank","noopener,noreferrer")};
  const openDetails=async(movie)=>{const mediaType=movie?.mediaType||(movie?.type==="TV Series"?"tv":"movie");const selectedSeed={...movie,mediaType};setSelected(selectedSeed);setDownloadMap({});setDetailLoading(true);loadDownloadMap(selectedSeed);try{const d=await apiGet(`/${mediaType==="tv"?"tv":"movies"}/${movie.id}`);setSelected({...d,mediaType});loadDownloadMap({...d,mediaType})}catch(e){notify("Details could not be loaded")}finally{setDetailLoading(false)}};
  const toggleFavorite=(movie)=>{setFavorites(p=>p.includes(movie.id)?p.filter(x=>x!==movie.id):[...p,movie.id]);vibrate("selection")};
  const addDownload=async(movie,quality)=>{
    try{
      const initData=window.Telegram?.WebApp?.initData||"";
      if(!initData){openBot();notify("Open Cine Universe inside Telegram first");return;}
      notify(`Sending ${quality} to Telegram…`);
      vibrate("impact");
      const res=await fetch(`${API_BASE}/download`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({initData,mediaType:movie.mediaType|| (movie.type==="TV Series"?"tv":"movie"),mediaId:movie.id,quality})});
      const data=await res.json();
      if(!res.ok) throw new Error(data?.error||"Download delivery failed");
      setDownloads(p=>[{movieId:movie.id,title:movie.title,quality,createdAt:Date.now()},...p.filter(x=>!(x.movieId===movie.id&&x.quality===quality))].slice(0,40));
      notify(`${movie.title} • ${quality} sent to Telegram ✓`);
      vibrate("success");
    }catch(e){notify(e.message||"Download delivery failed");}
  };

  async function loadDownloadMap(movie){
    try {
      setDownloadLoading(true);
      const d=await apiGet(`/downloads/map?mediaType=${encodeURIComponent(movie.mediaType||"movie")}&mediaId=${movie.id}`);
      setDownloadMap(d.qualities||{});
    } catch { setDownloadMap({}); }
    finally { setDownloadLoading(false); }
  }

  async function adminApi(path, options={}){
    const res=await fetch(`${API_BASE}${path}`,{...options,headers:{"content-type":"application/json","x-admin-key":adminKey,...(options.headers||{})}});
    const data=await res.json();
    if(!res.ok) throw new Error(data?.error||`Admin API error ${res.status}`);
    return data;
  }
  const openAdminPanel=()=>setActive("Admin");
  const saveAdminKey=()=>{sessionStorage.setItem("cine-admin-key",adminKey.trim());setAdminMessage("Admin key saved for this session.");};
  async function adminSearchTmdb(){
    if(!adminSearch.trim()) return;
    try{setAdminLoading(true);const d=await apiGet(`/search?q=${encodeURIComponent(adminSearch.trim())}`);setAdminResults(d.results||[]);setAdminMessage("");}
    catch(e){setAdminMessage(e.message||"Search failed");} finally{setAdminLoading(false);}
  }
  async function loadAdminMedia(media){
    setAdminSelected(media); setAdminMap({});
    try{const d=await apiGet(`/downloads/map?mediaType=${encodeURIComponent(media.mediaType)}&mediaId=${media.id}`);setAdminMap(d.qualities||{});}catch{}
    setAdminTvInviteUrl(""); setAdminForm(f=>({...f,mediaType:media.mediaType,mediaId:media.id,channel_chat_id:"",channel_message_id:"",caption:`Cine Universe • ${media.title}`})); if(media.mediaType==="tv"||media.type==="TV Series"){adminApi(`/admin/tv-channel?mediaId=${encodeURIComponent(media.id)}`).then(d=>setAdminTvInviteUrl(d.inviteUrl||"")).catch(()=>{});}
  }
  async function verifyChannelMessage(){
    if(!adminForm.channel_message_id.trim()) return setAdminMessage("Enter a Telegram channel message ID.");
    if(adminSelected?.mediaType!=="movie") return setAdminMessage("Telegram delivery mapping is for movies only.");
    try{
      setAdminLoading(true);
      const d=await adminApi('/admin/verify-channel-message',{
        method:'POST',
        body:JSON.stringify({
          channel_chat_id:adminForm.channel_chat_id.trim() || undefined,
          channel_message_id:Number(adminForm.channel_message_id)
        })
      });
      setAdminMessage(`Channel verified • ${d.channel?.title||d.channel?.username||d.channel?.id} • message #${d.message_id}`);
    }catch(e){setAdminMessage(e.message||"Could not verify channel message");}
    finally{setAdminLoading(false);}
  }
  async function saveQuality(){
    if(!adminSelected||adminSelected.mediaType!=="movie") return setAdminMessage("Select a movie. Telegram delivery is movies-only.");
    if(!adminForm.channel_message_id.trim()) return setAdminMessage("Enter the Telegram channel message ID.");
    try{
      setAdminLoading(true);
      await adminApi('/admin/downloads',{
        method:'POST',
        body:JSON.stringify({
          mediaType:'movie',
          mediaId:adminSelected.id,
          quality:adminForm.quality,
          channel_chat_id:adminForm.channel_chat_id.trim() || undefined,
          channel_message_id:Number(adminForm.channel_message_id),
          caption:adminForm.caption,
          size:adminForm.size,
          codec:adminForm.codec,
          audio:adminForm.audio
        })
      });
      setAdminMessage(`${adminForm.quality} channel message saved for ${adminSelected.title}.`);
      const d=await apiGet(`/downloads/map?mediaType=movie&mediaId=${adminSelected.id}`);
      setAdminMap(d.qualities||{});
      setAdminForm(f=>({...f,channel_message_id:"",channel_chat_id:"",size:"",codec:"",audio:""}));
    }catch(e){setAdminMessage(e.message||"Could not save mapping");}
    finally{setAdminLoading(false);}
  }
  async function deleteQuality(quality){
    if(!adminSelected) return;
    try{setAdminLoading(true);await adminApi(`/admin/downloads?mediaType=${encodeURIComponent(adminSelected.mediaType)}&mediaId=${adminSelected.id}&quality=${encodeURIComponent(quality)}`,{method:'DELETE'});const d=await apiGet(`/downloads/map?mediaType=${adminSelected.mediaType}&mediaId=${adminSelected.id}`);setAdminMap(d.qualities||{});setAdminMessage(`${quality} mapping removed.`);}catch(e){setAdminMessage(e.message||"Could not remove mapping");}finally{setAdminLoading(false);}
  }

  async function loadHome(){
    setLoading(true);setApiError("");setGenreTitle("");
    try{
      // Home UI is sourced only from Telegram-published catalogs.
      const [movieCatalog,tvCatalog]=await Promise.all([apiGet("/catalog"),apiGet("/tv-catalog")]);
      const pub=Array.isArray(movieCatalog?.results)?movieCatalog.results.map(x=>({...x,mediaType:"movie",type:x.type||"Movie",published:true})):[];
      const tvPublished=Array.isArray(tvCatalog?.results)?tvCatalog.results.map(x=>({...x,mediaType:"tv",type:x.type||"TV Series",published:true})):[];
      const all=[...pub,...tvPublished].sort((a,b)=>String(b.updatedAt||"").localeCompare(String(a.updatedAt||"")));
      const dramaTv=tvPublished.filter(x=>(x.genres||[]).some(g=>String(g).toLowerCase().includes("drama")));
      const indiaCodes=/^(hi|ta|te|ml|kn|bn|mr|pa|gu|ur)$/;
      const countryValue=(x)=>[x?.country,x?.countryCode,x?.country_code,x?.originalCountry,x?.original_country,...(Array.isArray(x?.originCountry)?x.originCountry:[]),...(Array.isArray(x?.origin_country)?x.origin_country:[]),...(Array.isArray(x?.productionCountries)?x.productionCountries:[]),...(Array.isArray(x?.production_countries)?x.production_countries:[])].filter(Boolean).map(v=>typeof v==='string'?v:String(v.code||v.iso_3166_1||v.iso||v.name||v)).join(' ').toLowerCase();
      const lang=(x)=>String(x?.originalLanguage||x?.original_language||x?.language||'').toLowerCase();
      const hasIndiaCountry=(x)=>/\b(in|inr|india|indian)\b/.test(countryValue(x)) || String(x?.countryCode||x?.country_code||'').toUpperCase()==='IN';
      const hasKoreaCountry=(x)=>/\b(kr|korea|south korea|korean)\b/.test(countryValue(x)) || String(x?.countryCode||x?.country_code||'').toUpperCase()==='KR';
      const indiaMovies=pub.filter(x=>indiaCodes.test(lang(x)) || hasIndiaCountry(x));
      const indiaTv=tvPublished.filter(x=>indiaCodes.test(lang(x)) || hasIndiaCountry(x));
      const koreanMovies=pub.filter(x=>lang(x)==='ko' || hasKoreaCountry(x));
      const koreanTv=tvPublished.filter(x=>lang(x)==='ko' || hasKoreaCountry(x));
      setPublishedMovies(pub);setPublishedTv(tvPublished);setTrending(all);
      setPopularMovies(pub);setPopularTv(tvPublished);setDramaTv(dramaTv);
      setIndianMovies(indiaMovies);setIndianTv(indiaTv);setKoreanMovies(koreanMovies);setKoreanTv(koreanTv);
      setItems(all);setApiError("");
    }catch(e){
      setApiError(e.message||"Could not load Telegram catalog.");
      setTrending([]);setPublishedMovies([]);setPublishedTv([]);setPopularMovies([]);setPopularTv([]);
      setDramaTv([]);setIndianMovies([]);setIndianTv([]);setKoreanMovies([]);setKoreanTv([]);setItems([]);
    }finally{setLoading(false)}
  }
  useEffect(()=>{loadHome()},[]);
  useEffect(()=>{const id=new URLSearchParams(window.location.search).get("movie");if(id){apiGet(`/movies/${id}`).then(m=>openDetails(m)).catch(()=>{});}},[]);
  useEffect(()=>{
    if(!query.trim()){
      if(active==="Home") setItems([...(publishedMovies||[]),...(publishedTv||[])]);
      else if(active==="Movies") setItems(popularMovies);
      else if(active==="TV Series") setItems(popularTv);
      return;
    }
    const t=setTimeout(async()=>{
      try{setLoading(true);const d=await apiGet(`/search?q=${encodeURIComponent(query.trim())}`);setItems(d.results||[]);setApiError("")}
      catch(e){setApiError(e.message)}finally{setLoading(false)}
    },330);
    return()=>clearTimeout(t);
  },[query,active,popularMovies,popularTv,publishedMovies,publishedTv]);

  const chooseGenre=(label)=>{
    setActive("Home");setQuery("");setGenreTitle(label);
    const wanted=String(label).toLowerCase();
    setItems([...(publishedMovies||[]),...(publishedTv||[])].filter(x=>(x.genres||[]).some(g=>{const v=String(g).toLowerCase();return v===wanted||v.includes(wanted)})).slice(0,20));
    setApiError("");
  };
  const currentItems=items; const currentHero=currentItems[hero%Math.max(currentItems.length,1)]||null;
  useEffect(()=>{if(!currentItems.length)return;const id=setInterval(()=>setHero(h=>(h+1)%Math.min(4,currentItems.length)),6500);return()=>clearInterval(id)},[currentItems.length]);
  const filtered=useMemo(()=>query?items:items,[items,query]);
  const homeTrending=trending;
  // V88 additive Home sections — sourced only from the existing Telegram-published catalog.
  const animeContent=useMemo(()=>[...(publishedMovies||[]),...(publishedTv||[])].filter(x=>{
    const genres=(x.genres||[]).map(g=>String(g).toLowerCase());
    const title=String(x.title||'').toLowerCase();
    const language=String(x.originalLanguage||x.original_language||x.language||'').toLowerCase();
    const originalCountry=String(x.country||x.originalCountry||x.original_country||'').toLowerCase();
    const isJapanese=language==='ja'||/\b(japan|japanese|jp)\b/.test(originalCountry);
    return genres.some(g=>g.includes('animation')||g==='anime'||g.includes('anime')) || isJapanese || /\banime\b/.test(title);
  }).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))),[publishedMovies,publishedTv]);

  return <div className="app-shell">
    <div className="ambient ambient-red"/><div className="ambient ambient-blue"/><div className="ambient ambient-green"/><div className="ambient ambient-yellow"/>
    <header className="topbar glass">
      <button className="brand" onClick={()=>{setActive("Home");setQuery("");setGenreTitle("")}}><img src="/cine-universe-logo.jpg" alt="Cine Universe"/><div><div className="brand-title">CINE <span>UNIVERSE</span></div><div className="brand-sub">YOUR GATEWAY TO MOVIES & TV SERIES</div></div></button>
      <div className="search-wrap"><Icon name="search" size={19}/><input value={query} onChange={e=>{setQuery(e.target.value);setActive("Home");setGenreTitle("")}} placeholder="Search for movies, series or people..."/><kbd>⌘ K</kbd></div>
      <nav className="desktop-nav">{["Home","Movies","TV Series"].map(x=><button key={x} className={active===x?"active":""} onClick={()=>{setActive(x);setQuery("");setGenreTitle("")}}>{x}</button>)}<button onClick={()=>document.getElementById("genres")?.scrollIntoView({behavior:"smooth"})}>Genres</button><button className="premium-btn">♛ Premium</button><button className="profile-btn"><Icon name="user" size={20}/></button></nav>
    </header>
    <main>
      {apiError&&<div className="api-status glass">⚠ {apiError} <span>{apiError.includes("TMDB")?"• Check .env and restart the API.":"• Showing available data."}</span></div>}
      {active!=="Downloads"&&active!=="Settings"&&<>
        <section className="hero glass">
          <div className="hero-bg" style={currentHero?.backdrop?{backgroundImage:`url(${currentHero.backdrop})`}:{}}/>
          <div className="hero-shade"/><div className="hero-glow"/>
          <button className="hero-arrow left" onClick={()=>setHero((hero+3)%Math.max(1,Math.min(4,currentItems.length)))}>‹</button><button className="hero-arrow right" onClick={()=>setHero((hero+1)%Math.max(1,Math.min(4,currentItems.length)))}>›</button>
          <div className="hero-content"><div className="hero-kicker"><span className="live-dot"/> {genreTitle?`GENRE • ${genreTitle.toUpperCase()}`:"FEATURED TONIGHT"}</div><h1>{currentHero?.title||"CINE UNIVERSE"}</h1><div className="chapter-label">{currentHero?.type==="Movie"?"C H A P T E R  •  P R E M I E R E":"S E R I E S  •  E X C L U S I V E"}</div><div className="hero-meta"><span>{(currentHero?.genres||[]).slice(0,3).join(" • ")||currentHero?.type}</span><span className="star"><Icon name="star" size={13}/>{currentHero?.rating||"—"}/10</span><span>{currentHero?.year||"—"}</span><b>{currentHero?.quality||"4K"}</b></div><p>{currentHero?.description||"Published content from the Cine Universe Telegram catalog."}</p><div className="hero-actions"><button className="primary-btn" onClick={()=>currentHero&&openDetails(currentHero)}><Icon name="play" size={16}/> Watch Now</button><button className={`glass-btn ${favorites.includes(currentHero?.id)?"selected":""}`} onClick={()=>toggleFavorite(currentHero)}><Icon name={favorites.includes(currentHero?.id)?"heart":"plus"} size={16}/>{favorites.includes(currentHero?.id)?"Saved":"My List"}</button></div></div>
          <div className="hero-features"><div className="feature-card red"><span className="feature-icon">⇩</span><div><strong>Fast Downloads</strong><small>High speed download</small></div></div><div className="feature-card gold"><span className="feature-icon">✦</span><div><strong>Verified Content</strong><small>100% safe & verified</small></div></div><div className="feature-card blue"><span className="feature-icon">▣</span><div><strong>4K Ultra Quality</strong><small>Best experience</small></div></div><button className="feature-card telegram" onClick={openChannel}><span className="feature-icon"><Icon name="telegram" size={20}/></span><div><strong>Telegram Channel</strong><small>Join our channel</small></div></button></div>
          <div className="hero-dots">{currentItems.slice(0,4).map((_,i)=><button key={i} className={i===hero%4?"active":""} onClick={()=>setHero(i)}/>)}</div>
        </section>
        <section className="section"><div className="section-head"><h2><span className="accent-line red"/> 🆕 Latest Cine Universe Updates</h2><span className="result-count">{publishedMovies.length+publishedTv.length} published</span></div><div className="poster-row">{[...publishedMovies,...publishedTv].sort((a,b)=>String(b.updatedAt||"").localeCompare(String(a.updatedAt||""))).slice(0,8).map(m=><button className="poster-card" key={`published-${m.mediaType}-${m.id}`} onClick={()=>openDetails(m)}><Poster movie={m}/><strong>{m.title}</strong><small>{m.year}</small></button>)}{!(publishedMovies.length+publishedTv.length)&&<div className="section-empty glass">No Telegram-published content yet.</div>}</div></section><section className="section"><div className="section-head"><h2><span className="accent-line red"/> Trending Now</h2><button onClick={()=>{setActive("Movies");setQuery("");}}>View all <Icon name="arrow" size={14}/></button></div><div className="poster-row">{homeTrending.slice(0,4).map(m=><button className="poster-card" key={`${m.mediaType}-${m.id}`} onClick={()=>openDetails(m)}><Poster movie={m}/><strong>{m.title}</strong><small>{m.year}</small></button>)}{!homeTrending.length&&<div className="section-empty glass">No Telegram-published content yet.</div>}</div></section>
        <section className="section" id="genres"><div className="section-head"><h2><span className="accent-line red"/> Genres</h2></div><div className="genre-grid">{GENRES.map(([label,icon,c])=><button key={label} className={`genre-card ${c}`} onClick={()=>chooseGenre(label)}><span>{icon}</span><strong>{label}</strong></button>)}</div></section>
        <section className="section anime-section featured-category-section"><div className="section-head"><h2><span className="accent-line purple"/> 🎌 Anime</h2><span className="section-badge">TELEGRAM</span></div><div className="poster-row category-row">{animeContent.slice(0,4).map(m=><button className="poster-card" key={`anime-${m.mediaType}-${m.id}`} onClick={()=>openDetails(m)}><Poster movie={m}/><strong>{m.title}</strong><small>{m.year}</small></button>)}{!animeContent.length&&<div className="section-empty glass category-empty"><b>🎌 Anime</b><span>Telegram-published anime will appear here automatically.</span></div>}</div></section>
        <section className="section"><div className="section-head"><h2><span className="accent-line red"/>{genreTitle?`${genreTitle} Picks`:active==="Home"?"Popular Movies":active}</h2><span className="result-count">{loading?"Loading…":`${filtered.length} titles`}</span></div><div className="poster-grid">{loading?[0,1,2,3,4,5,6,7].map(i=><div className="poster-skeleton" key={i}/> ):filtered.slice(0,4).map(m=><button className="poster-card large" key={`${m.mediaType}-${m.id}`} onClick={()=>openDetails(m)}><Poster movie={m}/><strong>{m.title}</strong><small>{m.year}</small></button>)}{!loading&&!filtered.length&&<div className="empty glass"><span>✦</span><strong>No titles found</strong><p>Try another search or pick a genre.</p></div>}</div></section>
        <section className="section"><div className="section-head"><h2><span className="accent-line red"/> Popular TV Series</h2><button onClick={()=>{setActive("TV Series");setQuery("")}}>View all <Icon name="arrow" size={14}/></button></div><div className="poster-row">{popularTv.slice(0,4).map(m=><button className="poster-card" key={`${m.mediaType}-${m.id}`} onClick={()=>openDetails(m)}><Poster movie={m}/><strong>{m.title}</strong><small>{m.year}</small></button>)}</div></section>
        <section className="section country-hub-section"><div className="section-head"><h2><span className="accent-line blue"/> 🌍 Country Collections</h2><span className="section-badge">PUBLISHED ONLY</span></div><div className="country-collection-grid"><div className="country-collection-card glass"><div className="country-collection-head"><span className="country-flag big">🇮🇳</span><div><strong>Indian</strong><small>Movies & TV Series</small></div></div><div className="country-collection-stats"><span><b>{indianMovies.length}</b> Movies</span><span><b>{indianTv.length}</b> TV</span></div><p>{(indianMovies.length+indianTv.length)?"Telegram-published Indian content":"Indian titles will appear automatically when published in Telegram."}</p></div><div className="country-collection-card glass"><div className="country-collection-head"><span className="country-flag big">🇰🇷</span><div><strong>Korean</strong><small>Movies & TV Series</small></div></div><div className="country-collection-stats"><span><b>{koreanMovies.length}</b> Movies</span><span><b>{koreanTv.length}</b> TV</span></div><p>{(koreanMovies.length+koreanTv.length)?"Telegram-published Korean content":"Korean titles will appear automatically when published in Telegram."}</p></div></div></section>
        <section className="section"><div className="section-head"><h2><span className="accent-line purple"/> 🎭 Popular Drama TV Series</h2><button onClick={()=>{setActive("TV Series");setQuery("Drama");}}>View all <Icon name="arrow" size={14}/></button></div><div className="poster-row">{dramaTv.slice(0,4).map(m=><button className="poster-card" key={`drama-${m.mediaType}-${m.id}`} onClick={()=>openDetails(m)}><Poster movie={m}/><strong>{m.title}</strong><small>{m.year} • ⭐ {m.rating}</small></button>)}{!dramaTv.length&&<div className="section-empty glass">Drama TV Series are loading…</div>}</div></section><section className="section country-section"><div className="section-head"><h2><span className="accent-line purple"/> <span className="country-flag" aria-label="South Korea">🇰🇷</span> Korean Movies</h2><button onClick={()=>{setActive("Movies");setQuery("Korean")}}>View all <Icon name="arrow" size={14}/></button></div><div className="poster-row">{koreanMovies.slice(0,4).map(m=><button className="poster-card" key={`kr-movie-${m.mediaType}-${m.id}`} onClick={()=>openDetails(m)}><Poster movie={m}/><strong>{m.title}</strong><small>{m.year}</small></button>)}{!koreanMovies.length&&<div className="section-empty glass">Korean movies are loading…</div>}</div></section><section className="section country-section"><div className="section-head"><h2><span className="accent-line blue"/> <span className="country-flag" aria-label="South Korea">🇰🇷</span> Korean TV Series</h2><button onClick={()=>{setActive("TV Series");setQuery("Korean")}}>View all <Icon name="arrow" size={14}/></button></div><div className="poster-row">{koreanTv.slice(0,4).map(m=><button className="poster-card" key={`kr-tv-${m.mediaType}-${m.id}`} onClick={()=>openDetails(m)}><Poster movie={m}/><strong>{m.title}</strong><small>{m.year}</small></button>)}{!koreanTv.length&&<div className="section-empty glass">Korean TV series are loading…</div>}</div></section><section className="section country-section"><div className="section-head"><h2><span className="accent-line red"/> <span className="country-flag" aria-label="India">🇮🇳</span> Indian Movies</h2><button onClick={()=>{setActive("Movies");setQuery("")}}>View all <Icon name="arrow" size={14}/></button></div><div className="poster-row">{(indianMovies.length?indianMovies:[]).slice(0,4).map(m=><button className="poster-card" key={`${m.mediaType}-${m.id}`} onClick={()=>openDetails(m)}><Poster movie={m}/><strong>{m.title}</strong><small>{m.year}</small></button>)}</div>{!indianMovies.length&&<div className="section-empty glass">Indian movies are loading…</div>}</section>
        <section className="section country-section"><div className="section-head"><h2><span className="accent-line red"/> <span className="country-flag" aria-label="India">🇮🇳</span> Indian TV Series</h2><button onClick={()=>{setActive("TV Series");setQuery("")}}>View all <Icon name="arrow" size={14}/></button></div><div className="poster-row">{(indianTv.length?indianTv:[]).slice(0,4).map(m=><button className="poster-card" key={`${m.mediaType}-${m.id}`} onClick={()=>openDetails(m)}><Poster movie={m}/><strong>{m.title}</strong><small>{m.year}</small></button>)}</div>{publishedTv.length>0&&<><div className="section-head"><h2><span className="accent-line green"/> Cine Universe TV Updates</h2></div><div className="poster-row">{publishedTv.slice(0,4).map(x=><button className="poster-card" key={`pubtv-${x.id}`} onClick={()=>openDetails(x)}><Poster movie={x}/><strong>{x.title}</strong><small>{x.year} • ⭐ {x.rating}</small></button>)}</div></>}{!indianTv.length&&<div className="section-empty glass">Indian TV series are loading…</div>}</section>
      </>}
      {active==="Admin"&&<section className="section page-section admin-page"><div className="section-head"><h2><span className="accent-line red"/> Content Manager</h2><button onClick={()=>setActive("Settings")}>Back to Settings</button></div><div className="admin-layout"><div className="admin-card glass"><div className="admin-card-head"><div><h3>Admin Access</h3><p>Keep this key private. It authorizes channel-message mapping changes.</p></div><span>🔐</span></div><div className="admin-key-row"><input type="password" placeholder="ADMIN_KEY" value={adminKey} onChange={e=>setAdminKey(e.target.value)}/><button className="glass-btn" onClick={saveAdminKey}>Save</button></div><div className="admin-search-row"><input placeholder="Search a movie or TV series…" value={adminSearch} onChange={e=>setAdminSearch(e.target.value)} onKeyDown={e=>e.key==='Enter'&&adminSearchTmdb()}/><button className="primary-btn" onClick={adminSearchTmdb}><Icon name="search" size={16}/> Search</button></div>{adminMessage&&<div className="admin-message">{adminMessage}</div>}<div className="admin-results">{adminLoading&&<div className="admin-loading">Working…</div>}{adminResults.map(m=><button className={`admin-result ${adminSelected?.id===m.id&&adminSelected?.mediaType===m.mediaType?'selected':''}`} key={`${m.mediaType}-${m.id}`} onClick={()=>loadAdminMedia(m)}><Poster movie={m}/><div><strong>{m.title}</strong><small>{m.type} • {m.year} • ⭐ {m.rating}</small></div><Icon name="arrow" size={15}/></button>)}</div></div><div className="admin-card glass"><div className="admin-card-head"><div><h3>{adminSelected?adminSelected.title:"Select a title"}</h3><p>{adminSelected?`${adminSelected.type} • TMDB ${adminSelected.id}`:"Search and select a movie or TV series first."}</p></div><span>⬇</span></div>{adminSelected&&<>
  <div className="admin-current">
    <Poster movie={adminSelected} className="admin-current-poster"/>
    <div>
      <strong>{adminSelected.title}</strong>
      <small>{adminSelected.year} • {adminSelected.type} • ⭐ {adminSelected.rating}</small>
      <p>{adminSelected.description}</p>
    </div>
  </div>

  {(adminSelected?.mediaType==="tv" || adminSelected?.type==="TV Series") ? (
    <div className="admin-tv-channel-card glass">
      <div className="admin-card-head">
        <div>
          <h3>📺 Private TV Channel</h3>
          <p>Assign the private Telegram channel for this TV series.</p>
        </div>
        <span>📺</span>
      </div>
      <label>
        Private TV Channel Invite Link
        <input
          type="text"
          placeholder="https://t.me/+XXXXXXXXXXXX"
          value={adminTvInviteUrl}
          onChange={e=>setAdminTvInviteUrl(e.target.value)}
        />
      </label>
      <button
        className="primary-btn save-btn"
        onClick={async()=>{
          const link=adminTvInviteUrl.trim();
          if(!link){
            setAdminMessage("Enter the Telegram channel link first.");
            return;
          }
          if(!/^https:\/\/t\.me\//i.test(link)){
            setAdminMessage("Use a Telegram channel link such as https://t.me/+...");
            return;
          }
          try{
            setAdminLoading(true);
            setAdminMessage("Saving private TV channel…");
            const res=await adminApi('/admin/tv-channel',{
              method:'POST',
              body:JSON.stringify({mediaId:adminSelected.id,inviteUrl:link})
            });
            const saved=await adminApi(`/admin/tv-channel?mediaId=${encodeURIComponent(adminSelected.id)}`);
            setAdminTvInviteUrl(saved.inviteUrl||link);
            if(res?.published){
              setAdminMessage(`✅ TV channel saved • 📢 Update posted to Cine Universe Update • ${res.title||adminSelected.title}`);
            }else{
              setAdminMessage(`✅ TV channel saved • ⚠️ Channel B update could not be posted now: ${res?.publishError||"temporary Telegram error"}`);
            }
          }catch(e){
            setAdminMessage(`❌ ${e.message||"Could not save private TV channel"}`);
          }finally{
            setAdminLoading(false);
          }
        }}
      >
        Save TV Channel
      </button>
      {adminMessage&&<div className="admin-message tv-save-status">{adminMessage}</div>}
    </div>
  ) : (
    <>
      <div className="quality-manager">
        {Object.keys(QUALITY_META).map(q=>{
          const info=adminMap[q];
          return <div className={`quality-manager-row ${QUALITY_META[q].tone}`} key={q}>
            <div>
              <strong>{QUALITY_META[q].name}</strong>
              <small>{info?.available?`${info.size||"File mapped"}${info.codec?` • ${info.codec}`:""}${info.audio?` • ${info.audio}`:""}`:"Not mapped"}</small>
            </div>
            {info?.available?<button className="danger-btn" onClick={()=>deleteQuality(q)}>Remove</button>:<span className="unmapped">Not mapped</span>}
          </div>
        })}
      </div>

      <div className="admin-form">
        <label>Channel Chat ID<input placeholder="@dinidu20030304 or -100..." value={adminForm.channel_chat_id} onChange={e=>setAdminForm(f=>({...f,channel_chat_id:e.target.value}))}/></label>
        <label>Quality<select value={adminForm.quality} onChange={e=>setAdminForm(f=>({...f,quality:e.target.value}))}>{Object.keys(QUALITY_META).map(q=><option key={q}>{q}</option>)}</select></label>
        <label>Channel Message ID<input placeholder="e.g. 122" value={adminForm.channel_message_id} onChange={e=>setAdminForm(f=>({...f,channel_message_id:e.target.value}))}/></label>
        <div className="admin-two">
          <label>Size<input placeholder="e.g. 2.4 GB" value={adminForm.size} onChange={e=>setAdminForm(f=>({...f,size:e.target.value}))}/></label>
          <label>Codec<input placeholder="e.g. HEVC" value={adminForm.codec} onChange={e=>setAdminForm(f=>({...f,codec:e.target.value}))}/></label>
        </div>
        <label>Audio<input placeholder="e.g. English 5.1" value={adminForm.audio} onChange={e=>setAdminForm(f=>({...f,audio:e.target.value}))}/></label>
        <label>Caption<input value={adminForm.caption} onChange={e=>setAdminForm(f=>({...f,caption:e.target.value}))}/></label>
        <div className="admin-actions">
          <button className="glass-btn" onClick={verifyChannelMessage}>Verify Channel Message</button>
          <button className="primary-btn" onClick={saveQuality}>Save {adminForm.quality}</button>
        </div>
      </div>
    </>
  )}
</>}

</div></div></section>}
{active==="Downloads"&&<section className="section page-section"><div className="section-head"><h2><span className="accent-line red"/> Downloads</h2><button onClick={()=>setDownloads([])}>Clear all</button></div>{!downloads.length?<div className="empty glass"><span>⇩</span><strong>No downloads yet</strong><p>Choose a quality from a movie details panel.</p></div>:<div className="download-history">{downloads.map((d,i)=><div className="history-card glass" key={`${d.movieId}-${d.quality}-${i}`}><div><strong>{d.title}</strong><small>{d.quality} • Saved in your Mini App download list</small></div><button onClick={openChannel}><Icon name="telegram" size={16}/> Telegram</button></div>)}</div>}</section>}
      {active==="Favorites"&&<section className="section page-section"><div className="section-head"><h2><span className="accent-line red"/> Favorites</h2></div><div className="poster-grid">{[...trending,...popularMovies,...popularTv,...indianMovies,...indianTv].filter((m,i,a)=>favorites.includes(m.id)&&a.findIndex(x=>x.id===m.id)===i).slice(0,12).map(m=><button className="poster-card large" key={`${m.mediaType}-${m.id}`} onClick={()=>openDetails(m)}><Poster movie={m}/><strong>{m.title}</strong><small>{m.year}</small></button>)}{!favorites.length&&<div className="empty glass"><span>♡</span><strong>No favorites yet</strong><p>Tap My List on any movie or series.</p></div>}</div></section>}
      {active==="Settings"&&<section className="section page-section"><div className="section-head"><h2><span className="accent-line red"/> Settings</h2></div><div className="settings-grid"><div className="settings-card glass"><div className="settings-card-head"><div><h3>Telegram connection</h3><p>Official Cine Universe channel and bot.</p></div><span>✈</span></div><label>Channel URL<input value={config.channelUrl} onChange={e=>setConfig(c=>({...c,channelUrl:e.target.value}))}/></label><label>Bot URL<input value={config.botUrl} onChange={e=>setConfig(c=>({...c,botUrl:e.target.value}))}/></label><button className="primary-btn save-btn" onClick={()=>notify("Telegram links saved")}>Save Telegram Links</button><div className="tmdb-note">This product uses the TMDB API but is not endorsed or certified by TMDB.</div></div><div className="settings-card glass"><div className="settings-card-head"><div><h3>Experience</h3><p>Premium Cine Universe visual mode.</p></div><span>✦</span></div>{[["🎬","Cinematic mode","Enhanced neon lighting and glass depth"],["📳","Haptic feedback","Telegram vibration on supported devices"],["🔔","Download notifications","Show download confirmations inside the app"]].map(([i,t,s])=><div className="setting-toggle" key={t}><span className="toggle-icon">{i}</span><div><strong>{t}</strong><small>{s}</small></div><i className="switch"><b/></i></div>)}</div></div><div className="settings-card glass admin-launch-card"><div className="settings-card-head"><div><h3>Content Manager</h3><p>Securely attach Telegram files to movies and TV series.</p></div><span>✦</span></div><button className="primary-btn save-btn" onClick={openAdminPanel}>Open Admin Panel</button><small className="tmdb-note">Admin writes require the server ADMIN_KEY.</small></div></section>}
      <footer className="footer"><div className="footer-logo"><img src="/cine-universe-logo.jpg" alt=""/><div><strong>Cine Universe</strong><span>Premium cinematic streaming experience</span></div></div><p>© 2026 Cine Universe. All Rights Reserved.</p><p className="dev">Designed & Developed by <b>Dinidu Induwara</b> <span>♥</span></p></footer>
    </main>
    <nav className="bottom-nav glass">{[["Home","home"],["Movies","film"],["TV Series","tv"],["Favorites","heart"],["Downloads","download"],["Settings","settings"]].map(([l,i])=><button key={l} className={active===l?"active":""} onClick={()=>{setActive(l);if(l!=="Settings"&&l!=="Downloads"&&l!=="Favorites"){setQuery("");setGenreTitle("")}}}><Icon name={i} size={21}/><span>{l}</span>{l==="Downloads"&&downloads.length>0&&<b className="nav-badge">{downloads.length}</b>}</button>)}</nav>
    {toast&&<div className="toast glass">{toast}</div>}
    {selected&&<div className="modal-backdrop" onClick={()=>setSelected(null)}><div className="details-modal glass" onClick={e=>e.stopPropagation()}>{(selected.backdrop||selected.poster||selected.posterUrl)&&<div className="modal-backdrop-image" style={{backgroundImage:`url(${selected.backdrop||selected.poster||selected.posterUrl})`}}/>}<div className="modal-glow modal-glow-one"/><div className="modal-glow modal-glow-two"/><button className="modal-close" onClick={()=>setSelected(null)} aria-label="Close details"><Icon name="close" size={20}/></button><div className="modal-top"><div className="modal-poster-wrap"><Poster movie={selected} className="modal-poster"/><div className="poster-orbit"/><div className="poster-type-badge">{selected.type==="TV Series"?"SERIES":"MOVIE"}</div></div><div className="modal-info"><div className="eyebrow"><span className="live-dot"/> CINE UNIVERSE • {selected.type.toUpperCase()}</div><h3>{selected.title}</h3><div className="modal-meta"><span>{selected.year}</span><span>•</span><span>{detailLoading?"Loading…":selected.runtime||"—"}</span><span className="cert">{selected.type==="TV Series"?"TV":"HD"}</span></div><div className="modal-rating"><Icon name="star" size={15}/><b>{selected.imdbRating||selected.rating||"—"}/10</b><span>{selected.imdbRating?"IMDb":"TMDB"}</span>{selected.imdbVotes&&<small>{selected.imdbVotes} votes</small>}{selected.imdbUrl&&<button className="imdb-link" onClick={()=>window.open(selected.imdbUrl,"_blank","noopener,noreferrer")}>IMDb ↗</button>}</div><div className="modal-rating secondary-rating"><span>TMDB</span><b>{selected.tmdbRating||selected.rating||"—"}/10</b></div><div className="tags">{(selected.genres||[]).map(g=><span key={g}>{g}</span>)}</div><p>{selected.description}</p><div className="modal-actions"><button className="primary-btn trailer-btn modal-emboss" onClick={()=>window.open(selected.trailer?`https://www.youtube.com/watch?v=${selected.trailer}`:`https://www.youtube.com/results?search_query=${encodeURIComponent(selected.title+" trailer")}`,"_blank")}><span className="youtube-mark"><Icon name="youtube" size={16}/></span> Watch Trailer</button><button className="glass-btn facebook-page-btn modal-emboss" onClick={openFacebookPage}><Icon name="facebook" size={15}/> Facebook Page</button><button className={`glass-btn modal-emboss ${favorites.includes(selected.id)?"selected":""}`} onClick={()=>toggleFavorite(selected)}><Icon name="heart" size={15}/>{favorites.includes(selected.id)?"Saved":"Add to My List"}</button><button className="glass-btn share-btn modal-emboss" onClick={async()=>{const text=`${selected.title} • ${selected.year} | Cine Universe`;try{if(navigator.share)await navigator.share({title:selected.title,text});else{await navigator.clipboard?.writeText(text);notify("Movie details copied ✓")}}catch{}}}><Icon name="share" size={15}/></button></div></div></div><div className="cinema-divider"><span>✦</span></div>{Array.isArray(selected.cast)&&selected.cast.length>0&&<section className="cast-section"><div className="cast-head"><div><span className="section-kicker">STARRING</span><h4>Cast & Characters</h4></div><span className="cast-count">{selected.cast.length} featured</span></div><div className="cast-row">{selected.cast.slice(0,8).map((person,index)=>{const actor=typeof person==='string'?{name:person,character:"",profile:""}:person||{};const profileSource=actor.profile_path||actor.profilePath||actor.profile||"";const profile=profileSource?`${API_BASE}/cast-image?path=${encodeURIComponent(profileSource)}`:"";const initials=String(actor.name||"?").slice(0,1).toUpperCase();return <div className="cast-card" key={`${actor.name||"cast"}-${index}`}><div className="cast-avatar">{profile?<img src={profile} alt={actor.name||"Cast member"} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={e=>{e.currentTarget.style.display="none";const fallback=e.currentTarget.parentElement?.querySelector(".cast-fallback");if(fallback)fallback.style.display="grid";}}/>:null}<span className="cast-fallback" style={{display:profile?"none":"grid"}}>{initials}</span></div><strong>{actor.name||"Cast Member"}</strong>{actor.character&&<small>{actor.character}</small>}</div>})}</div></section>}{selected.type==="Movie"&&(()=>{const availableQualities=QUALITY.filter(([n,m,b,t])=>downloadMap[b]?.available); return <div className="download-section"><h4><span className="download-accent"><Icon name="download" size={17}/></span> Download Options <small className="download-note">Choose quality · Telegram delivery</small></h4>{availableQualities.length>0?<div className="quality-list">{availableQualities.map(([n,m,b,t])=>{const info=downloadMap[b]; return <div className={`quality-row ${t} available`} key={b}><div><strong>{n}</strong><small>{`${info.size||m}${info.codec?` • ${info.codec}`:""}${info.audio?` • ${info.audio}`:""}`}</small></div><span>{b}</span><button disabled={downloadLoading} onClick={()=>addDownload(selected,b)}><Icon name="download" size={18}/></button></div>})}</div>:<div className="empty-quality-state"><span>⇩</span><strong>No download quality available</strong><small>This title has no quality mapped in the Telegram database yet.</small></div>}</div>})()}{selected.type==="TV Series"&&selected.privateChannelUrl&&<div className="download-section"><h4><span className="download-accent"><Icon name="telegram" size={17}/></span> TV Series Channel</h4><button className="cta-line blue" onClick={()=>window.open(selected.privateChannelUrl,"_blank")}><span><Icon name="telegram" size={18}/></span><div><strong>Open Private TV Channel</strong><small>Official channel for this series</small></div><b>Open Channel ↗</b></button></div>}<div className="modal-telegram"><button className="cta-line blue" onClick={openChannel}><span><Icon name="telegram" size={18}/></span><div><strong>Download on Telegram</strong><small>Open the official Cine Universe channel</small></div><b>Open Channel ↗</b></button><button className="cta-line purple" onClick={openBot}><span><Icon name="bot" size={18}/></span><div><strong>Send to My Bot</strong><small>Open your Cine Universe download bot</small></div><b>Send to Bot ↗</b></button></div></div></div>}
  </div>
}

createRoot(document.getElementById("root")).render(<App/>);
