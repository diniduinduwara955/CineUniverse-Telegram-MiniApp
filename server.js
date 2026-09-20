import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const app = express();
const PORT = Number(process.env.PORT || 8787);
const TMDB_BASE = 'https://api.themoviedb.org/3';
const POSTER_BASE = 'https://image.tmdb.org/t/p/w500';
const BACKDROP_BASE = 'https://image.tmdb.org/t/p/original';
const CAST_IMAGE_BASE = 'https://image.tmdb.org/t/p/w185';
const OMDB_BASE = 'https://www.omdbapi.com/';
const cache = new Map();
const CACHE_MS = 120_000;
const TELEGRAM_POLL_TIMEOUT = Number(process.env.TELEGRAM_POLL_TIMEOUT || 25);
const TELEGRAM_RETRY_BASE_MS = Number(process.env.TELEGRAM_RETRY_BASE_MS || 1500);
const TELEGRAM_RETRY_MAX_MS = Number(process.env.TELEGRAM_RETRY_MAX_MS || 15000);
const TELEGRAM_OFFSET_FILE = path.join(process.cwd(), 'server', 'telegram-offset.json');

app.use(cors({ origin: process.env.CLIENT_ORIGIN || true }));
app.use(express.json());

app.get('/api/health',(req,res)=>res.json({ok:true,service:'cine-universe-api'}));

app.get('/api/cast-image', async (req,res)=>{
  try{
    const raw=String(req.query.path||'').trim();
    if(!raw) return res.status(400).end();

    let target='';
    if(/^https?:\/\/image\.tmdb\.org\/t\/p\/[A-Za-z0-9_./-]+$/i.test(raw)){
      target=raw;
    }else if(/^\/[A-Za-z0-9_./-]+$/.test(raw)){
      target=`${POSTER_BASE}/${raw.replace(/^\/+/,'')}`;
    }else{
      return res.status(400).end();
    }

    const response=await fetch(target,{
      headers:{
        'User-Agent':'Mozilla/5.0 CineUniverse/76',
        'Accept':'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    });
    if(!response.ok) return res.status(response.status).end();

    const type=response.headers.get('content-type')||'image/jpeg';
    const buffer=Buffer.from(await response.arrayBuffer());
    res.status(200);
    res.setHeader('Content-Type',type);
    res.setHeader('Content-Length',String(buffer.length));
    res.setHeader('Cache-Control','public, max-age=86400');
    res.setHeader('X-CineUniverse-Cast-Proxy','1');
    res.send(buffer);
  }catch(err){
    console.warn('[cast-image] proxy failed:',err.message||err);
    res.status(502).end();
  }
});

function requireTmdbKey(res) {
  if (!process.env.TMDB_API_KEY) {
    res.status(500).json({ error: 'TMDB_API_KEY is not configured on the server.' });
    return false;
  }
  return true;
}

async function tmdb(path, params = {}) {
  if (!process.env.TMDB_API_KEY) throw new Error('TMDB_API_KEY is not configured on the server.');
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('api_key', process.env.TMDB_API_KEY);
  url.searchParams.set('language', 'en-US');
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  }

  const cacheKey = url.toString();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_MS) return cached.data;

  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data?.status_message || `TMDB HTTP ${response.status}`);
    err.status = response.status;
    throw err;
  }
  cache.set(cacheKey, { time: Date.now(), data });
  return data;
}

function normalize(item, mediaType, genreMap = {}) {
  const title = mediaType === 'tv' ? item.name : item.title;
  const date = mediaType === 'tv' ? item.first_air_date : item.release_date;
  const ids = item.genre_ids || [];
  const genres = (item.genres || []).map(g => g.name).filter(Boolean);
  const mappedGenres = ids.map(id => genreMap[id]).filter(Boolean);
  return {
    id: item.id,
    tmdbId: item.id,
    mediaType,
    type: mediaType === 'tv' ? 'TV Series' : 'Movie',
    title: title || 'Untitled',
    year: date ? String(date).slice(0, 4) : '—',
    rating: Number(item.vote_average || 0).toFixed(1),
    popularity: item.popularity || 0,
    poster: item.poster_path ? `${POSTER_BASE}${item.poster_path}` : '',
    backdrop: item.backdrop_path ? `${BACKDROP_BASE}${item.backdrop_path}` : '',
    description: item.overview || 'No description available.',
    quality: '4K',
    genres: [...new Set([...genres, ...mappedGenres])],
    accent: mediaType === 'tv' ? 'blue' : 'red',
    originalLanguage: item.original_language || ''
  };
}

function pickResults(data) {
  return (data.results || []).filter(x => x.poster_path).slice(0, 20);
}

async function genreMapFor(mediaType) {
  const data = await tmdb(`/genre/${mediaType === 'tv' ? 'tv' : 'movie'}/list`);
  return Object.fromEntries((data.genres || []).map(g => [g.id, g.name]));
}

function safeRun(handler) {
  return async (req, res) => {
    try { await handler(req, res); }
    catch (error) { res.status(error.status || 502).json({ error: error.message || 'Upstream API error' }); }
  };
}


const DOWNLOADS_FILE = path.join(process.cwd(), 'server', 'downloads.json');
const FILE_EXPIRY_FILE = path.join(process.cwd(), 'server', 'file-expiry-jobs.json');
const FILE_EXPIRY_MS = 48 * 60 * 60 * 1000;
const TV_CATALOG_FILE = path.join(process.cwd(), 'server', 'published-tv-catalog.json');
const TV_CHANNELS_FILE = path.join(process.cwd(), 'server', 'tv-channel-map.json');
const CATALOG_FILE = path.join(process.cwd(), 'server', 'published-catalog.json');


async function loadTvCatalog(){try{return JSON.parse(await fs.readFile(TV_CATALOG_FILE,'utf8'));}catch{return {};}}
async function saveTvCatalog(v){await fs.writeFile(TV_CATALOG_FILE,JSON.stringify(v,null,2));}
async function loadTvChannels(){try{return JSON.parse(await fs.readFile(TV_CHANNELS_FILE,'utf8'));}catch{return {};}}
async function saveTvChannels(v){await fs.writeFile(TV_CHANNELS_FILE,JSON.stringify(v,null,2));}
async function getTvChannelUrl(id){const m=await loadTvChannels();return String(m[String(id)]?.inviteUrl||m[String(id)]||'').trim();}
function tvEpisodeLike(post){
  const filename=String(post?.document?.file_name||post?.video?.file_name||post?.audio?.file_name||'');
  const caption=String(post?.caption||post?.text||'');
  const v=`${filename} ${caption}`.toLowerCase();
  return /\bs\d{1,2}\s*e\d{1,3}\b/.test(v)
      || /\bseason\s*\d{1,2}\b/.test(v)
      || /\bepisode\s*\d{1,3}\b/.test(v)
      || /\b(?:complete|full)\s+season\b/.test(v);
}

function cleanTvTitle(post){
  const raw=String(post?.document?.file_name||post?.video?.file_name||post?.audio?.file_name||post?.caption||post?.text||'');
  return normalizeText(raw)
    .replace(/\.[^.]+$/,'')
    .replace(/\bs\d{1,2}\s*e\d{1,3}\b/gi,' ')
    .replace(/\bseason\s*\d{1,2}\b/gi,' ')
    .replace(/\bepisode\s*\d{1,3}\b/gi,' ')
    .replace(/\b(?:complete|full)\s+season\b/gi,' ')
    .replace(/\b(?:2160p|2160|4k|1080p|1080|fhd|720p|720|hd|480p|480|web[- ]?dl|webrip|bluray|brrip|remux|x264|x265|h264|h265|hevc|aac|ddp\d*|dd\d*|atmos|dual[- ]?audio|multi|subs?|english|eng|yify|yts)\b/gi,' ')
    .replace(/\b(19|20)\d{2}\b/g,' ')
    .replace(/[._-]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

async function findTvFromUpload(post){
  const q=cleanTvTitle(post);
  if(!q || q.length<2) return null;

  const source=`${post?.document?.file_name||post?.video?.file_name||post?.audio?.file_name||''} ${post?.caption||post?.text||''}`;
  const year=String(source.match(/\b(19|20)\d{2}\b/)?.[0]||'');

  const variants=[q];
  const stripped=q.replace(/\b(?:unrated|retail|repack|proper|extended|uncut|remastered|subs?|multi|dual|audio)\b/gi,' ').replace(/\s+/g,' ').trim();
  if(stripped && stripped.toLowerCase()!==q.toLowerCase()) variants.push(stripped);

  const scored=new Map();
  for(const query of variants){
    const paramsList=[
      {query,include_adult:'false',page:1},
      ...(year?[{query,first_air_date_year:year,include_adult:'false',page:1}]:[])
    ];
    for(const params of paramsList){
      try{
        const data=await tmdb('/search/tv',params);
        for(const item of (data?.results||[]).slice(0,20)){
          if(!item?.id) continue;
          const title=normalizeText(item.name||item.original_name||'').toLowerCase();
          const qq=query.toLowerCase();
          let score=Number(item.popularity||0)*0.15;
          if(title===qq) score+=1200;
          if(title.includes(qq)||qq.includes(title)) score+=350;
          const qTokens=qq.split(/\s+/).filter(x=>x.length>2);
          const hit=qTokens.filter(tok=>title.includes(tok)).length;
          score+=hit*40;
          if(year && String(item.first_air_date||'').slice(0,4)===year) score+=500;
          if(item.poster_path) score+=35;
          const key=String(item.id);
          const old=scored.get(key);
          if(!old || score>old.score) scored.set(key,{item,score,query});
        }
      }catch(err){
        console.warn('[tv-match] TMDB TV search failed:',{query,params,error:err.message||err});
      }
    }
  }

  const best=[...scored.values()].sort((a,b)=>b.score-a.score)[0];
  if(!best) return null;
  return best.item;
}

function tvUpdateText(tv,episodeLabel=''){
  const title=tv.name||tv.original_name||'TV Series';
  const year=String(tv.first_air_date||'').slice(0,4)||'—';
  const rating=Number(tv.vote_average||0).toFixed(1);
  const imdbRating=String(tv.imdbRating||'').trim();
  const genres=(tv.genres||[]).map(g=>g.name).filter(Boolean);
  const cast=(tv.credits?.cast||[]).slice(0,8).map(x=>x.name).filter(Boolean);
  const seasons=tv.number_of_seasons?`${tv.number_of_seasons} Season${tv.number_of_seasons===1?'':'s'}`:'—';
  const episodes=tv.number_of_episodes?String(tv.number_of_episodes):'—';
  const language=String(tv.original_language||'').toUpperCase()||'—';
  const tagline=String(tv.tagline||'').trim();
  const overview=htmlEscape(tv.overview||'No description available.');
  const lines=[
    '╔══════════════════════╗',
    '📺 <b>CINE UNIVERSE</b>',
    '╚══════════════════════╝',
    '',
    `🔥 <b>${htmlEscape(title)}</b>`,
    `📅 <b>First Air:</b> ${year}`,
    imdbRating?`⭐ <b>IMDb:</b> ${htmlEscape(imdbRating)}/10`:`⭐ <b>IMDb:</b> Not available`,
    `◈ <b>TMDB:</b> ${tmdbRating}/10`,
    `📚 <b>Seasons:</b> ${htmlEscape(seasons)}`,
    `🎞️ <b>Episodes:</b> ${htmlEscape(episodes)}`,
    `🌐 <b>Language:</b> ${htmlEscape(language)}`,
    episodeLabel?`🎯 <b>Latest Upload:</b> ${htmlEscape(episodeLabel)}`:'',
    genres.length?`🎭 <b>Genres:</b> ${htmlEscape(genres.join(' • '))}`:'',
    tagline?`💬 <b>${htmlEscape(tagline)}</b>`:'',
    '',
    '📝 <b>STORY</b>',
    `<b>${overview}</b>`,
    '',
    cast.length?`🌟 <b>CAST:</b> <b>${htmlEscape(cast.join(' • '))}</b>`:'',
    '',
    '📥 <b>AVAILABLE ON CINE UNIVERSE</b>',
    '━━━━━━━━━━━━━━━━━━━━',
    '✨ <b>Cine Universe Official</b>',
    copyright_line
  ];
  return lines.filter(Boolean).join('\n');
}




// ---------- V82 Telegram message design (isolated from existing catalog/UI logic) ----------
function channelMovieUpdateText(movie){
  const title=movie.title||movie.original_title||'Movie';
  const year=String(movie.release_date||'').slice(0,4);
  const imdb=String(movie.imdbRating||'').trim();
  const genres=(movie.genres||[]).map(g=>g.name).filter(Boolean).slice(0,2);
  const cast=(movie.credits?.cast||[]).slice(0,3).map(x=>x.name).filter(Boolean);
  const overview=String(movie.overview||'').trim();
  const shortOverview=overview.length>110 ? `${overview.slice(0,107).trimEnd()}…` : overview;
  return [
    '🎬 <b>CINE UNIVERSE</b>',
    `🔥 <b>${htmlEscape(title)}</b>${year?` • ${htmlEscape(year)}`:''}`,
    imdb?`⭐ <b>IMDb</b> ${htmlEscape(imdb)}/10`:'⭐ <b>IMDb</b> —',
    genres.length?`🎭 ${htmlEscape(genres.join(' • '))}`:'',
    cast.length?`👥 ${htmlEscape(cast.join(' • '))}`:'',
    shortOverview?`📝 ${htmlEscape(shortOverview)}`:'',
    '',
    '📥 <b>Download options below 👇</b>'
  ].filter(Boolean).join('\n');
}

function channelTvUpdateText(tv,episodeLabel=''){
  const title=tv.name||tv.original_name||'TV Series';
  const year=String(tv.first_air_date||'').slice(0,4);
  const imdb=String(tv.imdbRating||'').trim();
  const genres=(tv.genres||[]).map(g=>g.name).filter(Boolean).slice(0,2);
  const cast=(tv.credits?.cast||[]).slice(0,3).map(x=>x.name).filter(Boolean);
  return [
    '📺 <b>CINE UNIVERSE</b>',
    `🔥 <b>${htmlEscape(title)}</b>${year?` • ${htmlEscape(year)}`:''}`,
    episodeLabel?`🎯 ${htmlEscape(episodeLabel)}`:'',
    imdb?`⭐ <b>IMDb</b> ${htmlEscape(imdb)}/10`:'⭐ <b>IMDb</b> —',
    genres.length?`🎭 ${htmlEscape(genres.join(' • '))}`:'',
    cast.length?`👥 ${htmlEscape(cast.join(' • '))}`:'',
    '',
    '📥 <b>Download options below 👇</b>'
  ].filter(Boolean).join('\n');
}

function groupMovieResultText(movie, qualities=[]){
  const title=movie.title||movie.original_title||'Movie';
  const year=String(movie.release_date||'').slice(0,4);
  const imdb=String(movie.imdbRating||'').trim();
  const qualityText=qualities.length?qualities.join(' • '):'No quality';
  return [
    `🎬 <b>${htmlEscape(title)}</b>${year?` • ${htmlEscape(year)}`:''}`,
    imdb?`⭐ IMDb ${htmlEscape(imdb)}/10`:'⭐ IMDb —',
    `✅ ${htmlEscape(qualityText)}`,
    '📥 <b>Quality එකක් තෝරන්න 👇</b>'
  ].join('\n');
}

function groupTvResultText(tv){
  const title=tv.title||'TV Series';
  const episode=String(tv.lastEpisode||'').trim();
  const imdb=String(tv.imdbRating||'').trim();
  return [
    `📺 <b>${htmlEscape(title)}</b>${tv.year?` • ${htmlEscape(tv.year)}`:''}`,
    episode?`🎯 ${htmlEscape(episode)}`:'',
    imdb?`⭐ IMDb ${htmlEscape(imdb)}/10`:'⭐ IMDb —',
    '📥 <b>Available options 👇</b>'
  ].filter(Boolean).join('\n');
}

function groupResultImage(entry, details){
  // Deliberately use the backdrop for group results so the group message is visually distinct
  // from the poster-only design published in the Update Channel. Poster is only the fallback.
  return entry?.backdrop || (details?.backdrop_path ? `${BACKDROP_BASE}${details.backdrop_path}` : '') || entry?.poster || (details?.poster_path ? `${POSTER_BASE}${details.poster_path}` : '');
}

function tvEpisodeLabel(post){
  const source=String(post?.document?.file_name||post?.video?.file_name||post?.audio?.file_name||'')+' '+String(post?.caption||post?.text||'');
  let m=source.match(/\bs(\d{1,2})\s*e(\d{1,3})\b/i);
  if(m) return `S${String(m[1]).padStart(2,'0')}E${String(m[2]).padStart(2,'0')}`;
  m=source.match(/\bseason\s*(\d{1,2}).*?\bepisode\s*(\d{1,3})\b/i);
  if(m) return `S${String(m[1]).padStart(2,'0')}E${String(m[2]).padStart(2,'0')}`;
  return '';
}

async function telegramSendPhotoWithRetry(chatId,photo,caption,options={},extra={},attempts=4){
  let lastErr;
  for(let attempt=1;attempt<=attempts;attempt++){
    try{
      return await telegramSendPhoto(chatId,photo,caption,options,extra);
    }catch(err){
      lastErr=err;
      const status=Number(err?.status||0);
      const transient=[429,500,502,503,504].includes(status)||/HTTP 50[0234]/.test(String(err?.message||''));
      if(!transient || attempt===attempts) throw err;
      const wait=Math.min(1000*Math.pow(2,attempt-1),8000);
      console.warn(`[tv-publisher] Telegram sendPhoto transient failure (${status||'network'}), retrying in ${wait}ms`);
      await new Promise(resolve=>setTimeout(resolve,wait));
    }
  }
  throw lastErr||new Error('Telegram sendPhoto failed');
}

async function publishTvCatalogUpdateById(tvId, channelUrl=''){
  const id=Number(tvId);
  if(!Number.isFinite(id)||id<=0) throw Object.assign(new Error('Invalid TV Series TMDB ID.'),{status:400});

  const details=await tvDetailsWithCredits(id);
  const imdb=await getImdbMetadata(details);
  details.imdbRating=imdb.imdbRating; details.imdbVotes=imdb.imdbVotes; details.imdbId=imdb.imdbId; details.imdbUrl=imdb.imdbUrl;
  if(!details?.id) throw Object.assign(new Error('TV Series not found on TMDB.'),{status:404});
  if(!details.poster_path) throw Object.assign(new Error('This TV Series has no poster on TMDB.'),{status:422});

  const url=String(channelUrl||await getTvChannelUrl(id)).trim();
  const rows=[];
  if(url) rows.push([{text:'📺 Open TV Channel',url}]);
  const mini=buildMiniAppUrl(id);
  if(mini) rows.push([{text:'🎬 Open in Mini App',url:mini}]);
  rows.push([{text:'🤖 Open Bot',url:`https://t.me/${BOT_USERNAME}`}]);

  const catalog=await loadTvCatalog();
  const entry={
    id,
    type:'TV Series',
    title:details.name||details.original_name||'TV Series',
    year:String(details.first_air_date||'').slice(0,4)||'—',
    rating:Number(details.vote_average||0).toFixed(1),
    poster:`${POSTER_BASE}${details.poster_path}`,
    backdrop:details.backdrop_path?`${BACKDROP_BASE}${details.backdrop_path}`:'',
    description:details.overview||'',
    genres:(details.genres||[]).map(g=>g.name),
    originalLanguage:details.original_language||'',
    originalCountry:(details.origin_country||[]).join(' '),
    originCountry:details.origin_country||[],
    origin_country:details.origin_country||[],
    productionCountries:(details.production_countries||[]),
    production_countries:(details.production_countries||[]),
    countryCode:(details.origin_country?.[0]||''),
    cast:(details.credits?.cast||[]).slice(0,8).map(x=>x.name).filter(Boolean),
    imdbRating:imdb.imdbRating||null, imdbVotes:imdb.imdbVotes||null, imdbId:imdb.imdbId||null, imdbUrl:imdb.imdbUrl||null,
    privateChannelUrl:url,
    lastEpisode:catalog[String(id)]?.lastEpisode||'',
    updatedAt:new Date().toISOString()
  };
  catalog[String(id)]=entry;
  await saveTvCatalog(catalog);

  const sent=await telegramSendPhotoWithRetry(
    UPDATE_CHANNEL_CHAT_ID,
    `${POSTER_BASE}${details.poster_path}`,
    channelTvUpdateText(details,entry.lastEpisode||''),
    {inline_keyboard:rows}
  );

  return {
    published:true,
    mediaType:'tv',
    tmdbId:id,
    title:entry.title,
    updateMessageId:sent?.result?.message_id||null,
    miniAppUrl:mini||null,
    privateChannelConfigured:Boolean(url)
  };
}

async function publishTvUpdate(post){
  if(String(post?.chat?.id)!==String(MOVIE_UPLOAD_CHANNEL_CHAT_ID)) return {skipped:true,reason:'not_tv_upload_channel'};
  if(!tvEpisodeLike(post)) return {skipped:true,reason:'not_tv_episode'};

  const tv=await findTvFromUpload(post);
  if(!tv) return {skipped:true,reason:'tv_not_found'};

  const details=await tvDetailsWithCredits(tv.id);
  const imdb=await getImdbMetadata(details);
  details.imdbRating=imdb.imdbRating; details.imdbVotes=imdb.imdbVotes; details.imdbId=imdb.imdbId; details.imdbUrl=imdb.imdbUrl;
  const url=await getTvChannelUrl(tv.id);
  const episode=tvEpisodeLabel(post);

  const rows=[];
  if(url) rows.push([{text:'📺 Open TV Channel',url}]);
  const mini=buildMiniAppUrl(tv.id);
  if(mini) rows.push([{text:'🎬 Open in Mini App',url:mini}]);
  rows.push([{text:'🤖 Open Bot',url:`https://t.me/${BOT_USERNAME}`}]);

  const catalog=await loadTvCatalog();
  const entry={
    id:Number(tv.id),
    type:'TV Series',
    title:details.name||details.original_name||'TV Series',
    year:String(details.first_air_date||'').slice(0,4)||'—',
    rating:Number(details.vote_average||0).toFixed(1),
    poster:details.poster_path?`${POSTER_BASE}${details.poster_path}`:'',
    backdrop:details.backdrop_path?`${BACKDROP_BASE}${details.backdrop_path}`:'',
    description:details.overview||'',
    genres:(details.genres||[]).map(g=>g.name),
    originalLanguage:details.original_language||'',
    originalCountry:(details.origin_country||[]).join(' '),
    originCountry:details.origin_country||[],
    origin_country:details.origin_country||[],
    productionCountries:(details.production_countries||[]),
    production_countries:(details.production_countries||[]),
    countryCode:(details.origin_country?.[0]||''),
    cast:(details.credits?.cast||[]).slice(0,8).map(x=>x.name).filter(Boolean),
    imdbRating:imdb.imdbRating||null, imdbVotes:imdb.imdbVotes||null, imdbId:imdb.imdbId||null, imdbUrl:imdb.imdbUrl||null,
    privateChannelUrl:url||'',
    lastEpisode:episode||'',
    updatedAt:new Date().toISOString()
  };
  catalog[String(tv.id)]=entry;
  await saveTvCatalog(catalog);

  if(!details.poster_path) return {skipped:true,reason:'tv_no_poster',tmdbId:Number(tv.id),title:entry.title};

  const sent=await telegramSendPhotoWithRetry(
    UPDATE_CHANNEL_CHAT_ID,
    `${POSTER_BASE}${details.poster_path}`,
    channelTvUpdateText(details,episode),
    {inline_keyboard:rows}
  );

  return {
    published:true,
    mediaType:'tv',
    tmdbId:Number(tv.id),
    title:entry.title,
    episode:episode||null,
    updateMessageId:sent?.result?.message_id||null,
    miniAppUrl:mini||null,
    privateChannelConfigured:Boolean(url)
  };
}


function groupReplyOptions(message){
  const messageId=Number(message?.message_id);
  if(!messageId) return {};
  return {reply_parameters:{message_id:messageId,allow_sending_without_reply:true}};
}

function groupMention(user){
  const id=Number(user?.id||0);
  const name=String(user?.first_name||user?.username||'මිතුරා').trim();
  if(!id) return `<b>${htmlEscape(name)}</b>`;
  return `<a href="tg://user?id=${id}">${htmlEscape(name)}</a>`;
}

async function handleGroupTvRequest(message){
  if(!['group','supergroup'].includes(message?.chat?.type)) return {skipped:true};
  const raw=requestTextFromMessage(message);
  if(!raw||/^\/(start|help)\b/i.test(raw)) return {handled:false};

  const text=cleanRequestText(raw);
  const q=normalizeText(text).toLowerCase().trim();
  if(q.length<2) return {handled:false};

  const queryYear=(q.match(/\b(19|20)\d{2}\b/)||[])[0]||'';
  const titleQ=normalizeText(q.replace(/\b(19|20)\d{2}\b/g,' ')).trim();
  const qTokens=titleQ.split(/\s+/).filter(t=>t.length>=2);
  if(!qTokens.length) return {handled:false};

  const catalog=await loadTvCatalog();
  let best=null;

  for(const e of Object.values(catalog)){
    const title=normalizeText(e.title||'').toLowerCase().trim();
    if(!title) continue;
    const titleTokens=title.split(/\s+/).filter(Boolean);
    const matched=qTokens.filter(token=>titleTokens.includes(token) || title.includes(token));
    const coverage=qTokens.length?matched.length/qTokens.length:0;
    let score=coverage*100;

    if(title===titleQ) score+=1000;
    else if(title.startsWith(titleQ)) score+=700;
    else if(title.includes(titleQ)) score+=500;

    if(queryYear && String(e.year||'').slice(0,4)===queryYear) score+=400;
    if(queryYear && String(e.year||'').slice(0,4)!==queryYear) score-=300;

    // Require strong title coverage; a generic word in a title must not trigger a reply.
    const minimum=queryYear?700:620;
    if((coverage>=0.75 || title===titleQ || title.startsWith(titleQ)) && score>=minimum){
      if(!best || score>best.score) best={entry:e,score,coverage};
    }
  }

  if(!best) return {handled:false};

  const tv=best.entry;
  const rows=[];
  if(tv.privateChannelUrl) rows.push([{text:'📺 Open TV Channel',url:tv.privateChannelUrl}]);
  const mini=buildMiniAppUrl(tv.id);
  if(mini) rows.push([{text:'🎬 Open in Mini App',url:mini}]);
  rows.push([{text:'🤖 Open Bot',url:`https://t.me/${BOT_USERNAME}`}]);

  const body=groupTvResultText(tv);
  const replyExtra=groupReplyOptions(message);
  const taggedBody=`👋 ${groupMention(message.from)}\n\n${body}`;
  const groupImage=groupResultImage(tv,{});
  if(groupImage) await telegramSendPhotoWithRetry(message.chat.id,groupImage,taggedBody,{inline_keyboard:rows},replyExtra);
  else await telegramSendMessage(message.chat.id,taggedBody,{inline_keyboard:rows},replyExtra);

  return {handled:true,found:true,mediaType:'tv',tmdbId:tv.id};
}


async function loadDownloadMap() {
  try {
    const raw = await fs.readFile(DOWNLOADS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function loadCatalog(){try{return JSON.parse(await fs.readFile(CATALOG_FILE,'utf8'));}catch{return {};}}
async function saveCatalog(catalog){await fs.writeFile(CATALOG_FILE,JSON.stringify(catalog,null,2),'utf8');}
function qualityOrder(){return ['4K','1080P','720P','480P'];}

async function enrichPublishedMovieEntry(entry){
  const id=Number(entry?.tmdbId||entry?.id);
  if(!Number.isFinite(id)||id<=0) return entry;
  if(entry.originalLanguage || entry.originalCountry || entry.originCountry || entry.productionCountries || entry.countryCode) return entry;
  try{
    const details=await movieDetailsWithCredits(id);
    return {
      ...entry,
      originalLanguage:details.original_language||entry.originalLanguage||'',
      originalCountry:(details.origin_country||[]).join(' '),
      originCountry:details.origin_country||[],
      origin_country:details.origin_country||[],
      productionCountries:details.production_countries||[],
      production_countries:details.production_countries||[],
      countryCode:(details.origin_country?.[0]||details.production_countries?.[0]?.iso_3166_1||entry.countryCode||'')
    };
  }catch(err){
    console.warn('[catalog] category metadata enrichment failed',id,err.message||err);
    return entry;
  }
}

async function enrichPublishedTvEntry(entry){
  const id=Number(entry?.tmdbId||entry?.id);
  if(!Number.isFinite(id)||id<=0) return entry;
  if(entry.originalLanguage || entry.originalCountry || entry.originCountry || entry.productionCountries || entry.countryCode) return entry;
  try{
    const details=await tvDetailsWithCredits(id);
    return {
      ...entry,
      originalLanguage:details.original_language||entry.originalLanguage||'',
      originalCountry:(details.origin_country||[]).join(' '),
      originCountry:details.origin_country||[],
      origin_country:details.origin_country||[],
      productionCountries:details.production_countries||[],
      production_countries:details.production_countries||[],
      countryCode:(details.origin_country?.[0]||'' )
    };
  }catch(err){
    console.warn('[tv-catalog] category metadata enrichment failed',id,err.message||err);
    return entry;
  }
}

function buildCatalogEntry(details,map,id,imdb={}){
  const qualities={};
  for(const q of qualityOrder()){
    const item=map[`movie:${id}:${q}`];
    if(item?.channel_message_id)qualities[q]={available:true,channel_chat_id:item.channel_chat_id,channel_message_id:Number(item.channel_message_id),size:item.size||'',codec:item.codec||'',audio:item.audio||''};
  }
  const tmdbRating=Number(details.vote_average||0).toFixed(1);
  return {
    id:Number(id),tmdbId:Number(id),mediaType:'movie',type:'Movie',
    title:details.title||details.original_title||'Untitled',
    year:String(details.release_date||'').slice(0,4)||'—',
    rating:tmdbRating,tmdbRating,
    imdbRating:imdb.imdbRating||null,imdbVotes:imdb.imdbVotes||null,imdbId:imdb.imdbId||null,imdbUrl:imdb.imdbUrl||null,
    poster:details.poster_path?`${POSTER_BASE}${details.poster_path}`:'',
    backdrop:details.backdrop_path?`${BACKDROP_BASE}${details.backdrop_path}`:'',
    description:details.overview||'No description available.',
    genres:(details.genres||[]).map(g=>g.name).filter(Boolean),
    originalLanguage:details.original_language||'',
    originalCountry:(details.origin_country||[]).join(' '),
    originCountry:details.origin_country||[],
    origin_country:details.origin_country||[],
    productionCountries:(details.production_countries||[]),
    production_countries:(details.production_countries||[]),
    countryCode:(details.origin_country?.[0]||details.production_countries?.[0]?.iso_3166_1||''),
    runtime:details.runtime?`${Math.floor(details.runtime/60)}h ${details.runtime%60}m`:'',
    cast:mapCast(details,8), qualities,updatedAt:new Date().toISOString()
  };
}

function validateTelegramInitData(initData) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken || !initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  const authDate = Number(params.get('auth_date') || 0);
  if (!hash || !authDate) return null;
  if (Date.now() / 1000 - authDate > 86400) return null;
  params.delete('hash');
  const dataCheckString = [...params.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${k}=${v}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculated = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(calculated), Buffer.from(hash))) return null;
  let user = null;
  try { user = JSON.parse(params.get('user') || 'null'); } catch {}
  return user;
}

async function telegramCopyMessage(targetChatId, sourceChatId, messageId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured on the server.');
  const response = await fetch(`https://api.telegram.org/bot${token}/copyMessage`, {
    method: 'POST',
    headers: {'content-type':'application/json'},
    body: JSON.stringify({
      chat_id: targetChatId,
      from_chat_id: sourceChatId,
      message_id: Number(messageId)
    })
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    const err = new Error(data?.description || `Telegram HTTP ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return data;
}


async function telegramDeleteMessage(chatId,messageId){
  const token=process.env.TELEGRAM_BOT_TOKEN;
  if(!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured.');
  const response=await fetch(`https://api.telegram.org/bot${token}/deleteMessage`,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({chat_id:chatId,message_id:Number(messageId)})
  });
  const data=await response.json();
  if(!response.ok||!data.ok){
    const err=new Error(data?.description||`Telegram HTTP ${response.status}`);
    err.status=response.status;
    throw err;
  }
  return data;
}

async function loadFileExpiryJobs(){
  try{return JSON.parse(await fs.readFile(FILE_EXPIRY_FILE,'utf8'));}catch{return [];}
}
async function saveFileExpiryJobs(jobs){
  await fs.writeFile(FILE_EXPIRY_FILE,JSON.stringify(jobs,null,2),'utf8');
}
function scheduleFileExpiry(job){
  const delay=Math.max(1000,Number(job.expiresAt)-Date.now());
  setTimeout(async()=>{
    try{
      await telegramDeleteMessage(job.chatId,job.messageId);
      console.log(`[telegram-listener] expired file deleted: chat=${job.chatId} message=${job.messageId}`);
    }catch(err){
      console.warn(`[telegram-listener] expired file delete failed: chat=${job.chatId} message=${job.messageId}:`,err.message||err);
    }finally{
      const jobs=await loadFileExpiryJobs();
      await saveFileExpiryJobs(jobs.filter(x=>!(String(x.chatId)===String(job.chatId)&&Number(x.messageId)===Number(job.messageId))));
    }
  },delay);
}
async function restoreFileExpiryJobs(){
  const jobs=await loadFileExpiryJobs();
  const now=Date.now();
  const active=[];
  for(const job of jobs){
    if(!job?.chatId||!job?.messageId) continue;
    if(Number(job.expiresAt)<=now){
      try{await telegramDeleteMessage(job.chatId,job.messageId);}catch{}
    }else{
      active.push(job);
      scheduleFileExpiry(job);
    }
  }
  await saveFileExpiryJobs(active);
}

async function registerFileExpiry(chatId,messageId){
  const job={chatId:String(chatId),messageId:Number(messageId),expiresAt:Date.now()+FILE_EXPIRY_MS,createdAt:new Date().toISOString()};
  const jobs=await loadFileExpiryJobs();
  jobs.push(job);
  await saveFileExpiryJobs(jobs);
  scheduleFileExpiry(job);
  return job;
}

async function sendGroupProcessingMessage(message){
  if(!['group','supergroup'].includes(message?.chat?.type)) return null;
  const user=groupMention(message.from);
  const text=[
    '╭━━━〔 🎬 <b>CINE UNIVERSE</b> 〕━━━╮',
    '',
    `👋 <b>${user}</b>`,
    '',
    '🔎 <b>ඔයාගේ request එක අපි භාරගත්තා!</b>',
    '⏳ දැන් Movie / TV Series එක හඳුනාගෙන',
    '📚 Cine Universe catalog + TMDB details check කරනවා…',
    '',
    '✨ <i>පොඩ්ඩක් ඉන්න… result එක හොඳටම සූදානම් කරලා දෙන්නම්.</i>',
    '',
    '╰━━━━━━━━━━━━━━━━━━━━╯'
  ].join('\n');
  try{
    const sent=await telegramSendMessage(
      message.chat.id,
      text,
      undefined,
      groupReplyOptions(message)
    );
    return sent?.result?.message_id||null;
  }catch(err){
    console.warn('[telegram-listener] processing message failed:',err.message||err);
    return null;
  }
}
async function telegramGetChat(chatId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured on the server.');
  const response = await fetch(`https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(chatId)}`);
  const data = await response.json();
  if (!response.ok || !data.ok) {
    const err = new Error(data?.description || `Telegram HTTP ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return data.result;
}


// ---------- Automatic Channel Movie Update Publisher (V15) ----------
const CHANNEL_POLL_MS = Number(process.env.CHANNEL_POLL_MS || 3500);
const AUTO_PUBLISH = String(process.env.ENABLE_CHANNEL_AUTOPUBLISH || 'false').toLowerCase() === 'true';
const MINI_APP_URL = String(process.env.MINI_APP_URL || '').trim();
let MOVIE_UPLOAD_CHANNEL_CHAT_ID = String(process.env.MOVIE_UPLOAD_CHANNEL_CHAT_ID || '').trim();
let UPDATE_CHANNEL_CHAT_ID = String(process.env.UPDATE_CHANNEL_CHAT_ID || '').trim();
const BOT_USERNAME = String(process.env.TELEGRAM_BOT_USERNAME || 'CINE_UNIVERSE_OFFCIALS_BOT').replace(/^@/, '');
const copyright_line = '© 2026 <b>Cine Universe</b>. All Rights Reserved.';
let RESOLVED_CHANNEL_CHAT_ID = String(process.env.TELEGRAM_CHANNEL_CHAT_ID || '').trim();

function sameTelegramChat(postChat, configured) {
  if (!postChat || !configured) return false;
  const cfg = String(configured).trim();
  return String(postChat.id) === cfg ||
    (!!postChat.username && `@${String(postChat.username).replace(/^@/, '')}`.toLowerCase() === cfg.toLowerCase());
}

function normalizeQualityText(raw=''){return String(raw||'').normalize('NFKC').toLowerCase().replace(/[×✕✖]/g,'x').replace(/[‐‑‒–—−]/g,'-').replace(/[\[\]\(\)\{\},|]+/g,' ').replace(/[_]+/g,' ').replace(/\s+/g,' ').trim();}
function normalizeText(raw=''){return normalizeQualityText(raw);}
function inferQuality(raw=''){
  const v=normalizeQualityText(raw); if(!v)return '';
  if(/\b(?:4k|4kuhd|uhd|2160p?|2160i?)\b/.test(v)||/\b3840\s*[x*]\s*2160\b/.test(v))return '4K';
  if(/\b(?:1080p?|1080i?)\b/.test(v)||/\bfhd\b/.test(v)||/\b1920\s*[x*]\s*1080\b/.test(v))return '1080P';
  if(/\b(?:720p?|720i?)\b/.test(v)||/\bhd720\b/.test(v)||/\b1280\s*[x*]\s*720\b/.test(v))return '720P';
  if(/\b(?:480p?|480i?)\b/.test(v)||/\bsd480\b/.test(v)||/\b854\s*[x*]\s*480\b/.test(v))return '480P';
  return '';
}
function inferYear(raw=''){const m=String(raw).match(/\b(19|20)\d{2}\b/);return m?m[0]:'';}
function cleanMovieFilename(raw=''){
  let value=normalizeQualityText(raw).replace(/\.[^.]+$/,'');
  value=value.replace(/\b(?:2160p?|4k|4kuhd|uhd|1080p?|1080i?|fhd|720p?|720i?|hd|480p?|480i?|sd480)\b/gi,' ')
    .replace(/\b(?:bluray|blu-ray|brrip|br-rip|webrip|web-rip|web-dl|webdl|hdtv|dvdrip|remux|hdr10\+?|hdr|dv|dolby.?vision|x264|x265|h264|h265|hevc|av1|aac|ddp\d*|dd\d*|atmos|5\.1|7\.1|proper|repack|extended|uncut|yify|yts|rarbg|nf|amzn|multi|dual.?audio|subs?|eng|english)\b/gi,' ')
    .replace(/\b(?:19|20)\d{2}\b/g,' ').replace(/[._-]+/g,' ').replace(/\s+/g,' ').trim();
  return value;
}
function detectQualityFromSources(sources=[]){for(const source of sources.map(x=>String(x||'').trim()).filter(Boolean)){const q=inferQuality(source);if(q)return {quality:q,source:'filename/caption',matched:source};}return {quality:'',source:'none',matched:''};}
function extractTitleCandidates(post={}){
  const fileName=post?.document?.file_name||post?.audio?.file_name||post?.video?.file_name||'';
  const caption=String(post?.caption||post?.text||'').trim();
  const year=inferYear(`${fileName} ${caption}`); const c=[];
  if(fileName)c.push(cleanMovieFilename(fileName));
  if(caption){c.push(cleanMovieFilename(caption));const labelled=caption.match(/(?:movie|title|film|name)\s*[:\-]\s*([^\n|]+)/i);if(labelled?.[1])c.unshift(cleanMovieFilename(labelled[1]));}
  const ty=(`${fileName} ${caption}`).match(/^\s*(.+?)\s*[\[(]?((?:19|20)\d{2})[\])]?/i);if(ty?.[1])c.unshift(cleanMovieFilename(ty[1]));
  return {candidates:[...new Set(c.map(x=>x.trim()).filter(x=>x.length>=2))],year};
}
function extractChannelFile(post){
  const doc=post?.document,vid=post?.video,audio=post?.audio,caption=post?.caption||post?.text||'';
  if(!doc&&!vid&&!audio)return null;
  const filename=doc?.file_name||audio?.file_name||vid?.file_name||'';
  const q=detectQualityFromSources([filename,caption]);
  const width=Number(vid?.width||0),height=Number(vid?.height||0),maxDim=Math.max(width,height);
  let quality=q.quality,qualitySource=q.source,qualityMatched=q.matched;
  if(!quality&&maxDim){if(maxDim>=3000){quality='4K';qualitySource='video-dimensions';qualityMatched=`${width}x${height}`;}else if(maxDim>=1800){quality='1080P';qualitySource='video-dimensions';qualityMatched=`${width}x${height}`;}else if(maxDim>=1100){quality='720P';qualitySource='video-dimensions';qualityMatched=`${width}x${height}`;}else if(maxDim>=700){quality='480P';qualitySource='video-dimensions';qualityMatched=`${width}x${height}`;}}
  const tc=extractTitleCandidates(post);
  return {filename:filename||'(no filename)',titleCandidates:tc.candidates,titleGuess:tc.candidates[0]||'',quality,qualitySource,qualityMatched,year:tc.year,caption:String(caption),width,height,fileSize:Number(doc?.file_size||vid?.file_size||audio?.file_size||0),fileType:vid?'video':(doc?'document':'audio')};
}

async function telegramSendPhoto(chatId, photo, caption, replyMarkup, extra={}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured.');
  const payload={
    chat_id: chatId,
    photo,
    caption,
    parse_mode: 'HTML',
    reply_markup: replyMarkup,
    ...extra
  };
  const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: 'POST',
    headers: {'content-type':'application/json'},
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data?.description || `Telegram HTTP ${response.status}`);
  return data;
}

function htmlEscape(value = '') {
  return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
}

function buildMiniAppUrl(tmdbId) {
  if (!MINI_APP_URL) return '';
  const joiner = MINI_APP_URL.includes('?') ? '&' : '?';
  return `${MINI_APP_URL}${joiner}movie=${encodeURIComponent(tmdbId)}`;
}

function buildMovieSearchVariants(fileInfo) {
  const raw = [
    ...(Array.isArray(fileInfo?.titleCandidates) ? fileInfo.titleCandidates : []),
    fileInfo?.titleGuess || ''
  ].map(normalizeText).map(s => s.trim()).filter(Boolean);

  const variants = [];
  const push = v => {
    const clean = normalizeText(v).replace(/\s+/g,' ').trim();
    if (clean && !variants.some(x => x.toLowerCase() === clean.toLowerCase())) variants.push(clean);
  };

  for (const q of raw) {
    push(q);

    // Remove common non-title words that may poison TMDB search.
    let clean = q
      .replace(/\b(?:unrated|proper|repack|extended|uncut|remastered|director'?s?\s*cut|web[- ]?dl|web[- ]?rip|bluray|blu[- ]?ray|brrip|br[- ]?rip|dvdrip|hdtv|remux|yify|yts|x264|x265|hevc|h264|h265|aac|ddp\d*|dd\d*|atmos|5\.1|7\.1|hdr10\+?|hdr|dolby\s*vision|dual\s*audio|multi\s*audio|subs?|english|eng)\b/gi, ' ')
      .replace(/\s+/g,' ').trim();
    push(clean);

    // Release title often survives best when year/quality tokens are removed only.
    clean = q.replace(/\b(19|20)\d{2}\b/g,' ').replace(/\s+/g,' ').trim();
    push(clean);

    // Short fallback: first meaningful 2-7 words; preserves sequel numbers.
    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length > 7) {
      for (let n = 7; n >= 3; n--) push(words.slice(0,n).join(' '));
    }
  }

  return variants;
}

function scoreMovieCandidate(item, query, targetYear) {
  const title = normalizeText(item?.title || '').toLowerCase();
  const original = normalizeText(item?.original_title || '').toLowerCase();
  const q = normalizeText(query).toLowerCase();
  const itemYear = String(item?.release_date || '').slice(0,4);

  let score = Number(item?.popularity || 0) * 0.15;

  if (title === q || original === q) score += 1000;
  if (title.includes(q) || q.includes(title)) score += 320;

  // Token overlap prevents "Wrong Turn" from losing to an unrelated popular movie.
  const qTokens = q.split(/\s+/).filter(x => x.length >= 2);
  const titleTokens = new Set(`${title} ${original}`.split(/\s+/).filter(Boolean));
  const overlap = qTokens.filter(t => titleTokens.has(t)).length;
  score += overlap * 35;

  if (targetYear && itemYear === targetYear) score += 500;
  if (targetYear && itemYear && Math.abs(Number(itemYear)-Number(targetYear)) === 1) score += 80;
  if (item?.poster_path) score += 35;

  return score;
}

async function tmdbMovieSearchVariants(variants, targetYear='') {
  const scored = new Map();

  for (const query of variants) {
    const parameterSets = [
      { query, include_adult:'false', page:1, ...(targetYear ? {year:targetYear} : {}) },
      { query, include_adult:'false', page:1 }
    ];

    for (const params of parameterSets) {
      try {
        const data = await tmdb('/search/movie', params);
        const results = data?.results || [];

        for (const item of results.slice(0, 20)) {
          if (!item?.id) continue;
          const score = scoreMovieCandidate(item, query, targetYear);
          const key = String(item.id);
          const old = scored.get(key);
          if (!old || score > old.score) {
            scored.set(key, {item, score, query});
          }
        }

        if (results.length) break;
      } catch (err) {
        console.error('[tmdb-match] /search/movie failed:', {query, params, error:err.message || err});
      }
    }
  }

  // Last-resort multi search when movie search returns nothing useful.
  if (!scored.size) {
    for (const query of variants.slice(0, 4)) {
      try {
        const data = await tmdb('/search/multi', {
          query,
          include_adult:'false',
          page:1
        });
        for (const item of (data?.results || []).filter(x => x.media_type === 'movie').slice(0, 20)) {
          const score = scoreMovieCandidate(item, query, targetYear);
          const key = String(item.id);
          const old = scored.get(key);
          if (!old || score > old.score) scored.set(key, {item, score, query});
        }
      } catch (err) {
        console.error('[tmdb-match] /search/multi failed:', {query, error:err.message || err});
      }
    }
  }

  return [...scored.values()].sort((a,b)=>b.score-a.score);
}

async function findMovieForChannelPost(fileInfo){
  const variants = buildMovieSearchVariants(fileInfo);
  const ranked = await tmdbMovieSearchVariants(variants, fileInfo?.year || '');
  const best = ranked[0]?.item || null;

  if (!best) {
    console.warn('[tmdb-match] no movie result', {
      titleCandidates: fileInfo?.titleCandidates || [],
      variants,
      year: fileInfo?.year || null,
      filename: fileInfo?.filename || ''
    });
  }

  return best;
}

function logChannelDetection(post,fileInfo,movie=null){
  console.log('[channel-detect]',{
    messageId:post?.message_id,
    filename:fileInfo?.filename,
    candidates:fileInfo?.titleCandidates,
    year:fileInfo?.year||null,
    quality:fileInfo?.quality||'UNKNOWN',
    qualitySource:fileInfo?.qualitySource,
    qualityMatched:fileInfo?.qualityMatched||'',
    tmdbId:movie?.id||null,
    tmdbTitle:movie?.title||null
  });
}

function requestTextFromMessage(message){return String(message?.text||message?.caption||'').trim();}
function cleanRequestText(text=''){return String(text).replace(/^\/request(?:@\w+)?\s*/i,'').replace(/^\/movie(?:@\w+)?\s*/i,'').replace(/^movie\s*[:\-]?\s*/i,'').trim();}

async function sendSinhalaRequestNotFound(message){
  const chatId=message?.chat?.id;
  if(!chatId) return;
  const requested=String(requestTextFromMessage(message)||'').trim().slice(0,120);
  const safe=htmlEscape(requested||'මේ නම');
  const rows=[
    [{text:'🔎 Mini App එකෙන් සොයන්න',url:buildMiniAppUrl(0) || `https://t.me/${BOT_USERNAME}`}],
    [{text:'📢 Cine Universe Update',url:process.env.TELEGRAM_CHANNEL_URL || `https://t.me/${UPDATE_CHANNEL_USERNAME||BOT_USERNAME}` }]
  ];
  const text=[
    '🔍 <b>සමාවෙන්න! මේ Movie / TV Series එක හමු වුණේ නැහැ.</b>',
    '',
    `🎬 <b>ඔයා සෙව්වේ:</b> ${safe}`,
    '',
    '📚 මේ වෙලාවේ අපේ Cine Universe database එකේ publish කරලා තියෙන titles විතරයි group එකෙන් ලබා දෙන්නේ.',
    '',
    '✅ නම + වසර එක්ක search කරන්න.',
    'උදාහරණය: <code>Avatar 2009</code>',
    '',
    '📥 Movie එක අපේ Movie Upload Channel එකට publish කළාට පස්සේ තමයි group search එකෙන් ලබා දෙන්න පුළුවන්.',
    '',
    '✨ <b>Cine Universe Official</b>'
  ].join('\n');
  try{
    await telegramSendMessage(chatId,`👋 ${groupMention(message.from)}\n\n${text}`,{inline_keyboard:rows},groupReplyOptions(message));
  }catch(err){
    console.error('[telegram-listener] Sinhala request response failed:',err.message||err);
  }
}

async function telegramSendMessage(chatId,text,replyMarkup,extra={}){const token=process.env.TELEGRAM_BOT_TOKEN;if(!token)throw new Error('TELEGRAM_BOT_TOKEN is not configured.');const payload={chat_id:chatId,text,parse_mode:'HTML',reply_markup:replyMarkup,...extra};const response=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const data=await response.json();if(!response.ok||!data.ok)throw new Error(data?.description||`Telegram HTTP ${response.status}`);return data;}
async function answerCallbackQuery(id,text,showAlert=false){const token=process.env.TELEGRAM_BOT_TOKEN;if(!token)return;await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({callback_query_id:id,text,show_alert:showAlert})});}
async function resolveRequestedMovie(text){
  const q=cleanRequestText(text);
  if(!q||q.length<2)return null;

  const yearMatch=q.match(/\b(19|20)\d{2}\b/);
  const year=yearMatch?.[0]||'';
  const title=normalizeText(q.replace(/\b(19|20)\d{2}\b/g,' ')).toLowerCase().trim();
  if(title.length<2)return null;

  const queryTokens=title.split(/\s+/).filter(Boolean);
  const catalog=await loadCatalog();
  const ranked=[];

  for(const item of Object.values(catalog)){
    if(String(item.mediaType||'movie')!=='movie' && String(item.type||'Movie')!=='Movie') continue;

    const itemTitle=normalizeText(item.title||item.originalTitle||'').toLowerCase().trim();
    if(!itemTitle) continue;

    const itemTokens=itemTitle.split(/\s+/).filter(Boolean);
    const matched=queryTokens.filter(token=>itemTokens.includes(token) || itemTitle.includes(token)).length;
    const coverage=queryTokens.length?matched/queryTokens.length:0;

    let score=coverage*100;
    if(itemTitle===title) score+=1000;
    else if(itemTitle.startsWith(title)) score+=700;
    else if(itemTitle.includes(title)) score+=500;
    else if(title.includes(itemTitle) && itemTitle.length>=5) score+=250;

    if(year){
      if(String(item.year||'').slice(0,4)===year) score+=450;
      else score-=350;
    }

    if(item.poster) score+=10;

    // Reject weak/generic matches. Require most query tokens to belong to the title.
    const strong=(coverage>=0.75 || itemTitle===title || itemTitle.startsWith(title));
    if(strong && score>= (year?700:620)) ranked.push({item,score,coverage});
  }

  ranked.sort((a,b)=>b.score-a.score);
  return ranked[0]?.item||null;
}


async function movieDetailsWithCredits(id){return tmdb(`/movie/${id}`,{append_to_response:'credits,videos,release_dates,external_ids'});}
async function tvDetailsWithCredits(id){return tmdb(`/tv/${id}`,{append_to_response:'credits,videos,external_ids'});}

async function omdb(params={}) {
  const key=String(process.env.OMDB_API_KEY||'').trim();
  if(!key) return null;
  const url=new URL(OMDB_BASE);
  url.searchParams.set('apikey',key);
  for(const [k,v] of Object.entries(params)){if(v!==undefined&&v!==null&&v!=='')url.searchParams.set(k,String(v));}
  const response=await fetch(url);
  if(!response.ok) return null;
  const data=await response.json();
  return data?.Response==='True'?data:null;
}

async function getImdbMetadata(details){
  const imdbId=String(details?.external_ids?.imdb_id||details?.imdb_id||'').trim();
  let imdbRating=null, imdbVotes=null;
  if(imdbId){
    try{
      const omdbData=await omdb({i:imdbId});
      if(omdbData?.imdbRating && omdbData.imdbRating!=='N/A') imdbRating=Number(omdbData.imdbRating).toFixed(1);
      if(omdbData?.imdbVotes && omdbData.imdbVotes!=='N/A') imdbVotes=String(omdbData.imdbVotes);
    }catch(err){console.warn('[imdb] metadata lookup failed:',err.message||err);}
  }
  return {imdbId:imdbId||null, imdbUrl:imdbId?`https://www.imdb.com/title/${encodeURIComponent(imdbId)}/`:null, imdbRating, imdbVotes};
}

function mapCast(details,limit=8){
  return (details?.credits?.cast||[]).slice(0,limit).map(x=>({
    name:x.name||'',
    character:x.character||'',
    profile:x.profile_path?`${CAST_IMAGE_BASE}${x.profile_path}`:'',
    profile_path:x.profile_path||''
  })).filter(x=>x.name);
}
function availableQualityButtons(map,mediaId){return ['4K','1080P','720P','480P'].filter(q=>map[`movie:${mediaId}:${q}`]?.channel_message_id).map(q=>({text:`⬇️ ${q}`,callback_data:`movie:${mediaId}:${q}`}));}
function movieUpdateQualityRows(map,mediaId){
  const available=availableQualityButtons(map,mediaId);
  const rows=[];
  for(let i=0;i<available.length;i+=2) rows.push(available.slice(i,i+2));
  return rows;
}

function requestUpdateText(movie){
  const title=movie.title||movie.original_title||'Movie';
  const year=String(movie.release_date||'').slice(0,4)||'—';
  const rating=Number(movie.vote_average||0).toFixed(1);
  const genres=(movie.genres||[]).map(g=>g.name).filter(Boolean);
  const runtime=movie.runtime?`${Math.floor(movie.runtime/60)}h ${movie.runtime%60}m`:'—';
  const cast=(movie.credits?.cast||[]).slice(0,6).map(x=>x.name).filter(Boolean);
  const imdbRating=String(movie.imdbRating||'').trim();
  const tmdbRating=Number(movie.vote_average||0).toFixed(1);
  const language=String(movie.original_language||'').toUpperCase()||'—';
  const tagline=String(movie.tagline||'').trim();
  const overview=htmlEscape(movie.overview||'No description available.');
  const lines=[
    '╔══════════════════════╗',
    '🎬 <b>CINE UNIVERSE</b>',
    '╚══════════════════════╝',
    '',
    `🔥 <b>${htmlEscape(title)}</b>`,
    `📅 <b>Release:</b> ${year}`,
    imdbRating?`⭐ <b>IMDb:</b> ${htmlEscape(imdbRating)}/10`:`⭐ <b>IMDb:</b> Not available`,
    `◈ <b>TMDB:</b> ${tmdbRating}/10`,
    `⏱️ <b>Runtime:</b> ${htmlEscape(runtime)}`,
    `🌐 <b>Language:</b> ${htmlEscape(language)}`,
    genres.length?`🎭 <b>Genres:</b> ${htmlEscape(genres.join(' • '))}`:'',
    tagline?`💬 <b>${htmlEscape(tagline)}</b>`:'',
    '',
    '📝 <b>STORY</b>',
    `<b>${overview}</b>`,
    '',
    cast.length?`🌟 <b>CAST:</b> <b>${htmlEscape(cast.join(' • '))}</b>`:'',
    '',
    '📥 <b>AVAILABLE ON CINE UNIVERSE</b>',
    '━━━━━━━━━━━━━━━━━━━━',
    '✨ <b>Cine Universe Official</b>',
    copyright_line
  ];
  return lines.filter(Boolean).join('\n');
}


async function publishMovieUpdateFromChannelPost(post){
  if(!post?.chat)return {skipped:true,reason:'no_chat'};
  if(String(post.chat.id)!==String(MOVIE_UPLOAD_CHANNEL_CHAT_ID))return {skipped:true,reason:'not_movie_upload_channel'};
  const fileInfo=extractChannelFile(post);
  if(!fileInfo)return {skipped:true,reason:'not_movie_file_post'};
  const movie=await findMovieForChannelPost(fileInfo);
  logChannelDetection(post,fileInfo,movie);
  if(!movie){
    console.warn('[channel-router] Movie not matched after all TMDB search strategies:', {
      messageId: post.message_id,
      filename: fileInfo.filename,
      candidates: fileInfo.titleCandidates,
      year: fileInfo.year || null
    });
    return {skipped:true,reason:'tmdb_movie_not_found',titleGuess:fileInfo.titleGuess,titleCandidates:fileInfo.titleCandidates,year:fileInfo.year||null};
  }
  const details=await movieDetailsWithCredits(movie.id);
  const imdb=await getImdbMetadata(details);
  details.imdbRating=imdb.imdbRating; details.imdbVotes=imdb.imdbVotes; details.imdbId=imdb.imdbId; details.imdbUrl=imdb.imdbUrl;
  const map=await loadDownloadMap();
  if(fileInfo.quality){const key=`movie:${movie.id}:${fileInfo.quality}`;map[key]={...(map[key]||{}),channel_chat_id:String(MOVIE_UPLOAD_CHANNEL_CHAT_ID),channel_message_id:Number(post.message_id),title:details.title||details.original_title||'',size:post.document?.file_size||post.video?.file_size?String(post.document?.file_size||post.video?.file_size):'',updated_at:new Date().toISOString(),auto_detected:true};await fs.writeFile(DOWNLOADS_FILE,JSON.stringify(map,null,2));}
  const catalog=await loadCatalog();catalog[String(movie.id)]=buildCatalogEntry(details,map,movie.id,imdb);await saveCatalog(catalog);
  const fresh=await loadDownloadMap(),rows=movieUpdateQualityRows(fresh,movie.id),mini=buildMiniAppUrl(movie.id),nav=[];if(mini)nav.push({text:'🎬 Open in Mini App',url:mini});nav.push({text:'🤖 Open Bot',url:`https://t.me/${BOT_USERNAME}`});rows.push(nav);
  if(!details.poster_path)return {skipped:true,reason:'tmdb_movie_has_no_poster',tmdbId:movie.id,title:details.title};
  const sent=await telegramSendPhoto(UPDATE_CHANNEL_CHAT_ID,`${POSTER_BASE}${details.poster_path}`,channelMovieUpdateText(details),{inline_keyboard:rows});
  return {published:true,tmdbId:movie.id,title:details.title,quality:fileInfo.quality||'UNKNOWN',qualitySource:fileInfo.qualitySource,sourceMessageId:Number(post.message_id),updateMessageId:sent?.result?.message_id||null,miniAppUrl:mini||null};
}


function collectionRequestText(text=''){
  return cleanRequestText(text)
    .replace(/\b(19|20)\d{2}\b/g,' ')
    .replace(/\b(?:movie|movies|film|films|series|collection|part|vol(?:ume)?)\b/gi,' ')
    .replace(/\s+/g,' ')
    .trim();
}

async function findPublishedMovieCollection(query){
  const q=normalizeText(collectionRequestText(query)).toLowerCase();
  if(!q || q.length<2) return [];

  const tokens=q.split(/\s+/).filter(x=>x.length>1 && !['the','and','of'].includes(x));
  if(!tokens.length) return [];

  const catalog=await loadCatalog();
  const matches=[];
  for(const item of Object.values(catalog)){
    if(String(item.mediaType||'movie')!=='movie' && String(item.type||'Movie')!=='Movie') continue;
    const title=normalizeText(item.title||'').toLowerCase();
    if(!title) continue;
    const titleTokens=title.split(/\s+/).filter(Boolean);
    let score=0;

    if(title===q) score+=1000;
    if(title.startsWith(q)) score+=700;
    if(title.includes(q)) score+=500;

    const matched=tokens.filter(t=>titleTokens.includes(t) || title.includes(t)).length;
    if(matched===tokens.length) score+=250;
    score+=matched*55;

    // A base-name collection search should not pull in unrelated one-word matches.
    if(score>=300) matches.push({item,score});
  }

  matches.sort((a,b)=>{
    const ay=Number(a.item.year||0), by=Number(b.item.year||0);
    return a.score-b.score===0 ? ay-by : b.score-a.score;
  });

  const unique=[];
  const seen=new Set();
  for(const x of matches){
    const id=String(x.item.id||x.item.tmdbId||'');
    if(!id||seen.has(id)) continue;
    seen.add(id);
    unique.push(x.item);
  }
  return unique.slice(0,12);
}

async function sendMovieResultToGroup(message,movie){
  const chatId=message?.chat?.id||message;
  const details=await movieDetailsWithCredits(movie.id||movie.tmdbId);
  const map=await loadDownloadMap();
  const rows=movieUpdateQualityRows(map,movie.id||movie.tmdbId);
  const mini=buildMiniAppUrl(movie.id||movie.tmdbId);
  if(mini) rows.push([{text:'🎬 Open in Mini App',url:mini}]);
  rows.push([{text:'🤖 Open Bot',url:`https://t.me/${BOT_USERNAME}`}]);
  const tagged=message?.from?`👋 ${groupMention(message.from)}\n\n`:'';
  const available=availableQualityButtons(map,movie.id||movie.tmdbId).map(x=>String(x.text||'').replace(/^⬇️\s*/,''));
  const caption=tagged+groupMovieResultText(details,available);
  const extra=message?.message_id?groupReplyOptions(message):{};
  const groupImage=groupResultImage(movie,details);
  if(groupImage) await telegramSendPhoto(chatId,groupImage,caption,{inline_keyboard:rows},extra);
  else await telegramSendMessage(chatId,caption,{inline_keyboard:rows},extra);
}

async function sendMovieCollectionChooser(message,matches,query){
  const buttons=matches.map((movie)=>[{
    text:`🎬 ${movie.title}${movie.year?` (${movie.year})`:''}`,
    callback_data:`movie_select:${movie.id||movie.tmdbId}`
  }]);
  buttons.push([{text:'🤖 Open Bot',url:`https://t.me/${BOT_USERNAME}`}]);
  const safe=htmlEscape(query);
  const text=[
    '🎞️ <b>CINE UNIVERSE • COLLECTION</b>',
    `🔎 <b>${safe}</b>`,
    '',
    'Movies කිහිපයක් හම්බුණා. එකක් තෝරන්න 👇'
  ].join('\n');

  const cover=matches[0]?.poster||'';
  const taggedText=`👋 ${groupMention(message.from)}\n\n${text}`; const extra=groupReplyOptions(message);
  if(cover){
    await telegramSendPhoto(message.chat.id,cover,taggedText,{inline_keyboard:buttons},extra);
  }else{
    await telegramSendMessage(message.chat.id,taggedText,{inline_keyboard:buttons},extra);
  }
  return {handled:true,found:true,collection:true,count:matches.length};
}

async function handleGroupMovieRequest(message){
  if(!['group','supergroup'].includes(message?.chat?.type))return {skipped:true};
  const text=requestTextFromMessage(message);
  if(!text||/^\/(start|help)\b/i.test(text))return {skipped:true};

  // Base-name collection search: e.g. "Avatar", "Fast and Furious".
  // Only use it when multiple published catalog titles match.
  const collection=await findPublishedMovieCollection(text);
  const yearInQuery=/\b(19|20)\d{2}\b/.test(text);
  if(!yearInQuery && collection.length>=2){
    return await sendMovieCollectionChooser(message,collection,text);
  }

  const movie=await resolveRequestedMovie(text);
  if(!movie){
    await sendSinhalaRequestNotFound(message);
    return {handled:true,found:false};
  }

  await sendMovieResultToGroup(message,movie);
  return {handled:true,found:true,tmdbId:movie.id};
}


async function handleMovieCallback(callback){
  const data=String(callback?.data||'');
  const parts=data.split(':');
  const kind=parts[0];
  const userId=callback?.from?.id;
  if(!userId)return true;

  if(kind==='movie_select'){
    const mediaId=Number(parts[1]);
    if(!mediaId){
      await answerCallbackQuery(callback.id,'Movie එක හඳුනාගන්න බැහැ.',true);
      return true;
    }
    try{
      const catalog=await loadCatalog();
      const movie=catalog[String(mediaId)];
      if(!movie){
        await answerCallbackQuery(callback.id,'මේ Movie එක දැන් publish catalog එකේ නැහැ.',true);
        return true;
      }
      await sendMovieResultToGroup(callback.message,movie);
      await answerCallbackQuery(callback.id,'Movie එක තෝරාගත්තා ✅');
    }catch(err){
      console.error('[telegram-listener] collection selection failed:',err.message||err);
      await answerCallbackQuery(callback.id,'Movie එක load කරන්න බැරි වුණා. නැවත try කරන්න.',true);
    }
    return true;
  }

  const [_,mediaId,quality]=parts;
  if(kind!=='movie')return false;
  const map=await loadDownloadMap();
  const item=map[`movie:${mediaId}:${quality}`];
  if(!item?.channel_message_id){await answerCallbackQuery(callback.id,'That quality is not available yet.',true);return true;}
  try{
    const copied=await telegramCopyMessage(userId,item.channel_chat_id||MOVIE_UPLOAD_CHANNEL_CHAT_ID,item.channel_message_id);
    const copiedMessageId=copied?.result?.message_id;
    if(copiedMessageId){
      const warning=[
        '╭━━━〔 ⚠️ <b>FILE NOTICE</b> 〕━━━╮',
        '',
        '📥 <b>ඔයාට ලැබුණු Movie file එක තාවකාලිකයි.</b>',
        '🕒 <b>මේ file එක 48 පැය පසු ස්වයංක්‍රීයව මකා දමනු ලැබේ.</b>',
        '',
        '🔄 <b>File එක නැවත අවශ්‍ය නම්</b>',
        '🔎 <b>Group එකෙන් Movie එක නැවත request කරන්න.</b>',
        '',
        '💙 <b>Cine Universe</b>',
        '🎬 <b>Your Gateway to Movies & TV Series</b>',
        copyright_line,
        '',
        '╰━━━━━━━━━━━━━━━━━━━━╯'
      ].join('\n');
      await telegramSendMessage(
        userId,
        warning,
        undefined,
        {reply_parameters:{message_id:Number(copiedMessageId),allow_sending_without_reply:true}}
      );
      await registerFileExpiry(userId,copiedMessageId);
    }
    await answerCallbackQuery(callback.id,`Sent ${quality} to your bot chat.`);
  }catch(err){
    const msg=err?.message||'Telegram delivery failed';
    console.error('[telegram-listener] delivery failed:',msg);
    await answerCallbackQuery(
      callback.id,
      (msg.includes('chat not found')||msg.includes('blocked')||msg.includes('not initiated'))
        ? 'Open @'+BOT_USERNAME+' and press START first.'
        : msg,
      true
    );
  }
  return true;
}


async function resolveMovieAndUpdateChannels() {
  if (!MOVIE_UPLOAD_CHANNEL_CHAT_ID) {
    throw new Error('MOVIE_UPLOAD_CHANNEL_CHAT_ID is not configured.');
  }
  if (!UPDATE_CHANNEL_CHAT_ID) {
    throw new Error('UPDATE_CHANNEL_CHAT_ID is not configured.');
  }

  const uploadChat = await telegramGetChat(MOVIE_UPLOAD_CHANNEL_CHAT_ID);
  const updateChat = await telegramGetChat(UPDATE_CHANNEL_CHAT_ID);

  MOVIE_UPLOAD_CHANNEL_CHAT_ID = String(uploadChat.id);
  UPDATE_CHANNEL_CHAT_ID = String(updateChat.id);

  console.log(`[channel-router] Movie Upload Channel A: ${uploadChat.title || uploadChat.username || uploadChat.id} (${MOVIE_UPLOAD_CHANNEL_CHAT_ID})`);
  console.log(`[channel-router] Update Channel B: ${updateChat.title || updateChat.username || updateChat.id} (${UPDATE_CHANNEL_CHAT_ID})`);

  return { uploadChat, updateChat };
}

function requireAdmin(req,res){
  const configured=String(process.env.ADMIN_KEY||'').trim();
  const supplied=String(req.headers['x-admin-key']||'').trim();
  if(!configured){
    res.status(500).json({ok:false,error:'Server ADMIN_KEY is not configured.'});
    return false;
  }
  if(!supplied || supplied!==configured){
    res.status(401).json({ok:false,error:'Unauthorized admin key.'});
    return false;
  }
  return true;
}

app.post('/api/admin/diagnose-post',(req,res)=>{try{const info=extractChannelFile(req.body||{});res.json({ok:true,info});}catch(e){res.status(500).json({ok:false,error:e.message});}});

app.get('/api/admin/test-movie-match', safeRun(async (req,res) => {
  const fileInfo = {
    filename: String(req.query.filename || ''),
    titleCandidates: String(req.query.candidates || '').split('|').map(x=>x.trim()).filter(Boolean),
    titleGuess: String(req.query.title || ''),
    year: String(req.query.year || ''),
    quality: String(req.query.quality || '')
  };
  const variants = buildMovieSearchVariants(fileInfo);
  const ranked = await tmdbMovieSearchVariants(variants, fileInfo.year);
  res.json({
    ok:true,
    input:fileInfo,
    variants,
    best: ranked[0] ? {
      id: ranked[0].item.id,
      title: ranked[0].item.title,
      release_date: ranked[0].item.release_date,
      score: ranked[0].score,
      query: ranked[0].query
    } : null,
    top: ranked.slice(0,5).map(x=>({
      id:x.item.id,title:x.item.title,release_date:x.item.release_date,score:x.score,query:x.query
    }))
  });
}));

app.get('/api/detect-quality', (req,res) => {
  const input=String(req.query.text||'');
  res.json({ok:true,input,quality:inferQuality(input)});
});

app.post('/api/detect-quality', (req,res)=>{
  const samples=Array.isArray(req.body?.samples)?req.body.samples:[];
  res.json({ok:true,results:samples.map(input=>({input:String(input),quality:inferQuality(String(input))}))});
});


app.get('/api/tv-catalog',safeRun(async(req,res)=>{const catalog=await loadTvCatalog();let changed=false;const values=[];for(const item of Object.values(catalog)){const enriched=await enrichPublishedTvEntry(item);if(JSON.stringify(enriched)!==JSON.stringify(item)){catalog[String(item.id)]=enriched;changed=true;}values.push(enriched);}if(changed)await saveTvCatalog(catalog);res.json({ok:true,results:values.sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))});}));
app.get('/api/tv/:id',safeRun(async(req,res)=>{
  const id=Number(req.params.id);
  const data=await tvDetailsWithCredits(id);
  const imdb=await getImdbMetadata(data);
  const n=normalize(data,'tv');
  const privateChannelUrl=await getTvChannelUrl(id);
  res.json({
    ...n,
    tmdbRating:Number(data.vote_average||0).toFixed(1),
    imdbRating:imdb.imdbRating||null,
    imdbVotes:imdb.imdbVotes||null,
    imdbId:imdb.imdbId||null,
    imdbUrl:imdb.imdbUrl||null,
    runtime:data.episode_run_time?.[0]?`${data.episode_run_time[0]}m`:'—',
    trailer:(data.videos?.results||[]).find(v=>v.site==='YouTube'&&v.type==='Trailer')?.key||null,
    cast:mapCast(data,8),
    privateChannelUrl
  });
}));
app.post('/api/admin/tv-channel',safeRun(async(req,res)=>{
  if(!requireAdmin(req,res))return;
  const id=String(req.body?.mediaId||'').trim();
  const inviteUrl=String(req.body?.inviteUrl||'').trim();
  if(!id||!inviteUrl)return res.status(400).json({ok:false,error:'mediaId and inviteUrl are required.'});
  if(!/^https:\/\/t\.me\//i.test(inviteUrl))return res.status(400).json({ok:false,error:'Use a Telegram channel link such as https://t.me/+...'});

  const map=await loadTvChannels();
  map[id]={inviteUrl,updatedAt:new Date().toISOString()};
  await saveTvChannels(map);

  try{
    const published=await publishTvCatalogUpdateById(id,inviteUrl);
    res.json({ok:true,mediaId:id,inviteUrl,published:true,updateMessageId:published.updateMessageId,title:published.title});
  }catch(err){
    // The channel link is saved even if the Channel B publish temporarily fails.
    res.json({ok:true,mediaId:id,inviteUrl,published:false,publishError:err.message||'Channel B update failed temporarily'});
  }
}));
app.get('/api/admin/tv-channel',safeRun(async(req,res)=>{if(!requireAdmin(req,res))return;const id=String(req.query.mediaId||'').trim();if(!id)return res.status(400).json({ok:false,error:'mediaId is required.'});const inviteUrl=await getTvChannelUrl(id);res.json({ok:true,mediaId:id,inviteUrl:inviteUrl||''});}));
app.get('/api/catalog',safeRun(async(req,res)=>{
  const catalog=await loadCatalog();
  const map=await loadDownloadMap();
  const ids=[...new Set(Object.keys(map).filter(k=>k.startsWith('movie:')).map(k=>k.split(':')[1]).filter(Boolean))];
  let changed=false;
  for(const id of ids){
    if(catalog[String(id)]) continue;
    try{const details=await movieDetailsWithCredits(Number(id));const imdb=await getImdbMetadata(details);catalog[String(id)]=buildCatalogEntry(details,map,id,imdb);changed=true;}catch(err){console.warn('[catalog] hydrate failed',id,err.message||err);}
  }
  for(const [id,item] of Object.entries(catalog)){
    const enriched=await enrichPublishedMovieEntry(item);
    if(JSON.stringify(enriched)!==JSON.stringify(item)){catalog[id]=enriched;changed=true;}
  }
  if(changed) await saveCatalog(catalog);
  res.json({ok:true,results:Object.values(catalog).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))});
}));
app.get('/api/downloads/map',safeRun(async(req,res)=>{const mediaType=String(req.query.mediaType||'movie');const mediaId=String(req.query.mediaId||'');if(!mediaId)return res.status(400).json({ok:false,error:'mediaId is required'});if(mediaType!=='movie')return res.json({ok:true,mediaType,mediaId,qualities:{}});const map=await loadDownloadMap();const qualities={};for(const q of qualityOrder()){const item=map[`movie:${mediaId}:${q}`];if(item?.channel_message_id)qualities[q]={available:true,size:item.size||'',codec:item.codec||'',audio:item.audio||'',channel_message_id:Number(item.channel_message_id)};}res.json({ok:true,mediaType,mediaId,qualities});}));
app.post('/api/download',safeRun(async(req,res)=>{const {initData,mediaType='movie',mediaId,quality}=req.body||{};if(mediaType!=='movie')return res.status(400).json({ok:false,error:'Telegram file delivery is available for movies only.'});const user=validateTelegramInitData(String(initData||''));if(!user?.id)return res.status(401).json({ok:false,error:'Open the Mini App from Telegram so your session can be verified.'});const q=String(quality||'').toUpperCase();if(!qualityOrder().includes(q))return res.status(400).json({ok:false,error:'Unsupported quality.'});const map=await loadDownloadMap();const item=map[`movie:${mediaId}:${q}`];if(!item?.channel_message_id)return res.status(404).json({ok:false,error:`${q} is not available for this movie.`});const result=await telegramCopyMessage(user.id,item.channel_chat_id||MOVIE_UPLOAD_CHANNEL_CHAT_ID,item.channel_message_id);res.json({ok:true,delivered:true,quality:q,telegramMessageId:result?.result?.message_id||null});}));
app.get('/api/movies/:id',safeRun(async(req,res)=>{
  const id=Number(req.params.id);
  const details=await movieDetailsWithCredits(id);
  const imdb=await getImdbMetadata(details);
  const catalog=await loadCatalog();
  const row=catalog[String(id)]||{};
  const map=await loadDownloadMap();
  const entry=buildCatalogEntry(details,map,id,imdb);
  res.json({
    ...entry,...row,
    rating:entry.tmdbRating,
    tmdbRating:entry.tmdbRating,
    imdbRating:imdb.imdbRating||row.imdbRating||null,
    imdbVotes:imdb.imdbVotes||row.imdbVotes||null,
    imdbId:imdb.imdbId||row.imdbId||null,
    imdbUrl:imdb.imdbUrl||row.imdbUrl||null,
    description:details.overview||row.description,
    poster:details.poster_path?`${POSTER_BASE}${details.poster_path}`:row.poster,
    backdrop:details.backdrop_path?`${BACKDROP_BASE}${details.backdrop_path}`:row.backdrop,
    runtime:details.runtime?`${Math.floor(details.runtime/60)}h ${details.runtime%60}m`:row.runtime,
    trailer:(details.videos?.results||[]).find(v=>v.site==='YouTube'&&v.type==='Trailer')?.key||null,
    genres:(details.genres||[]).map(g=>g.name),
    cast:mapCast(details,8),
    published:Boolean(catalog[String(id)]),
    qualities:entry.qualities
  });
}));

app.get('/api/trending',safeRun(async(req,res)=>{const g=await genreMapFor('movie');const d=await tmdb('/trending/all/week');res.json({ok:true,results:pickResults(d).map(x=>normalize(x,x.media_type==='tv'?'tv':'movie',g))});}));
app.get('/api/movies',safeRun(async(req,res)=>{const g=await genreMapFor('movie');const d=await tmdb('/movie/popular',{page:1});const catalog=await loadCatalog();const pub=Object.values(catalog);const live=pickResults(d).map(x=>normalize(x,'movie',g));res.json({ok:true,results:[...pub,...live.filter(x=>!catalog[String(x.id)])].slice(0,30)});}));
app.get('/api/tv',safeRun(async(req,res)=>{const g=await genreMapFor('tv');const d=await tmdb('/tv/popular',{page:1});res.json({ok:true,results:pickResults(d).map(x=>normalize(x,'tv',g))});}));
app.get('/api/search',safeRun(async(req,res)=>{const q=String(req.query.q||'').trim();if(!q)return res.json({ok:true,results:[]});const [m,t]=await Promise.all([tmdb('/search/movie',{query:q,page:1}),tmdb('/search/tv',{query:q,page:1})]);const gM=await genreMapFor('movie'),gT=await genreMapFor('tv'),catalog=await loadCatalog();const pub=Object.values(catalog).filter(x=>String(x.title||'').toLowerCase().includes(q.toLowerCase()));const live=[...pickResults(m).map(x=>normalize(x,'movie',gM)),...pickResults(t).map(x=>normalize(x,'tv',gT))];res.json({ok:true,results:[...pub,...live.filter(x=>x.type==='TV Series'||!catalog[String(x.id)])].slice(0,30)});}));
app.get('/api/discover',safeRun(async(req,res)=>{const genre=String(req.query.genre||''),mediaType=String(req.query.mediaType||'movie'),g=await genreMapFor(mediaType);const gid=Object.entries(g).find(([,n])=>n.toLowerCase()===genre.toLowerCase())?.[0];if(!gid)return res.json({ok:true,results:[]});const d=await tmdb(`/discover/${mediaType}`,{with_genres:gid,page:1,sort_by:'popularity.desc'});res.json({ok:true,results:pickResults(d).map(x=>normalize(x,mediaType,g))});}));
app.get('/api/india/movies',safeRun(async(req,res)=>{const g=await genreMapFor('movie'),d=await tmdb('/discover/movie',{with_origin_country:'IN',page:1,sort_by:'popularity.desc'});res.json({ok:true,results:pickResults(d).map(x=>normalize(x,'movie',g))});}));
app.get('/api/india/tv',safeRun(async(req,res)=>{const g=await genreMapFor('tv'),d=await tmdb('/discover/tv',{with_origin_country:'IN',page:1,sort_by:'popularity.desc'});res.json({ok:true,results:pickResults(d).map(x=>normalize(x,'tv',g))});}));

app.get('/api/korean/movies',safeRun(async(req,res)=>{const g=await genreMapFor('movie'),d=await tmdb('/discover/movie',{with_origin_country:'KR',page:1,sort_by:'popularity.desc'});res.json({ok:true,results:pickResults(d).map(x=>normalize(x,'movie',g))});}));
app.get('/api/korean/tv',safeRun(async(req,res)=>{const g=await genreMapFor('tv'),d=await tmdb('/discover/tv',{with_origin_country:'KR',page:1,sort_by:'popularity.desc'});res.json({ok:true,results:pickResults(d).map(x=>normalize(x,'tv',g))});}));

let channelPollRunning=false;
async function loadTelegramOffset() {
  try {
    const raw = await fs.readFile(TELEGRAM_OFFSET_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Number.isFinite(Number(parsed.offset)) ? Number(parsed.offset) : 0;
  } catch {
    return Number(process.env.CHANNEL_UPDATE_OFFSET || 0);
  }
}

async function saveTelegramOffset(offset) {
  await fs.writeFile(TELEGRAM_OFFSET_FILE, JSON.stringify({ offset: Number(offset), updated_at: new Date().toISOString() }, null, 2), 'utf8');
}

async function telegramGetUpdates(token, offset) {
  const allowed = encodeURIComponent(JSON.stringify(['channel_post','message','callback_query']));
  const url = `https://api.telegram.org/bot${token}/getUpdates?timeout=${TELEGRAM_POLL_TIMEOUT}&allowed_updates=${allowed}${offset ? `&offset=${offset}` : ''}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), (TELEGRAM_POLL_TIMEOUT + 10) * 1000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Telegram HTTP ${response.status}`);
    const data = await response.json();
    if (!data.ok) throw new Error(data.description || 'Telegram getUpdates failed');
    return data;
  } finally { clearTimeout(timer); }
}



async function sendBotWelcome(message){
  if(message?.chat?.type!=='private') return {handled:false};
  const text=String(message?.text||'').trim();
  if(!/^\/start(?:@\w+)?(?:\s+.*)?$/i.test(text)) return {handled:false};

  const user=message?.from||{};
  const display=String(user.first_name||user.username||'මිතුරා').trim();
  const mention=`<a href="tg://user?id=${Number(user.id)}">${htmlEscape(display)}</a>`;

  const body=[
    '╔══════════════════════╗',
    '🎬 <b>CINE UNIVERSE</b>',
    '╚══════════════════════╝',
    '',
    `👋 ආයුබෝවන් ${mention}! ❤️`,
    '',
    '🍿 <b>Cine Universe Bot වෙත සාදරයෙන් පිළිගනිමු!</b>',
    '🎞️ Movies • TV Series • Downloads',
    '',
    '🔎 <b>Movie / Series එකක් හොයන්න</b>',
    'Group එකේ නම + වසර දාලා search කරන්න.',
    '<code>Avatar 2009</code>',
    '',
    '🎬 <b>Collection එකක් නම්</b>',
    '<code>Avatar</code>',
    '<code>Fast and Furious</code>',
    '',
    '📥 <b>Download</b>',
    'Available quality එක select කළාම file එක Telegram එකටම deliver වෙනවා.',
    '',
    '📢 <b>Official Updates</b>',
    'අලුත් Movie & TV updates සඳහා අපේ Official Channel එක follow කරන්න.',
    '',
    '✨ <b>Enjoy your cinematic journey with Cine Universe!</b>',
    '',
    '© 2026 <b>Cine Universe</b>. All Rights Reserved.'
  ].join('\n');

  const keyboard={inline_keyboard:[
    [{text:'📢 Official Update Channel',url:process.env.TELEGRAM_CHANNEL_URL||'https://t.me/dinidu20030304'}],
    [{text:'🎬 Open Cine Universe Mini App',url:MINI_APP_URL||`https://t.me/${BOT_USERNAME}`}],
  ]};

  const logoPath=path.join(process.cwd(),'public','cine-universe-logo.jpg');
  try{
    const token=process.env.TELEGRAM_BOT_TOKEN;
    if(!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured.');
    const photo=await fs.readFile(logoPath);
    const form=new FormData();
    form.append('chat_id',String(message.chat.id));
    form.append('photo',new Blob([photo],{type:'image/jpeg'}),'cine-universe-logo.jpg');
    form.append('caption',body);
    form.append('parse_mode','HTML');
    form.append('reply_markup',JSON.stringify(keyboard));

    const response=await fetch(`https://api.telegram.org/bot${token}/sendPhoto`,{method:'POST',body:form});
    const data=await response.json();
    if(!response.ok||!data.ok) throw new Error(data?.description||`Telegram HTTP ${response.status}`);
    return {handled:true,welcome:true,bot:true};
  }catch(err){
    console.warn('[telegram-listener] bot welcome photo failed, sending text fallback:',err.message||err);
    await telegramSendMessage(message.chat.id,body,{inline_keyboard:keyboard});
    return {handled:true,welcome:true,bot:true,fallback:true};
  }
}

async function sendGroupWelcome(message){
  const members=Array.isArray(message?.new_chat_members)?message.new_chat_members:[];
  if(!members.length) return {handled:false};

  const groupId=String(process.env.MOVIE_REQUEST_GROUP_CHAT_ID||'').trim();
  if(groupId && String(message?.chat?.id)!==groupId) return {handled:false};

  const mentions=members.map(user=>{
    const display=String(user?.first_name||user?.username||'අලුත් සාමාජිකයා').trim();
    return `<a href="tg://user?id=${Number(user.id)}">${htmlEscape(display)}</a>`;
  }).join(', ');

  const text=[
    '🎬 <b>CINE UNIVERSE</b>',
    '',
    `👋 ආයුබෝවන් ${mentions}! ❤️`,
    '',
    '🍿 <b>Cine Universe වෙත සාදරයෙන් පිළිගනිමු!</b>',
    '🎞️ Movies • TV Series • Reviews • Updates',
    '',
    '🔎 <b>Search:</b> <code>Avatar 2009</code>',
    '🎬 <b>Collection:</b> <code>Avatar</code>',
    '',
    '📢 <b>Updates:</b> Official Channel',
    '🤖 <b>Downloads:</b> Cine Universe Bot',
    '',
    '✨ කරුණාකර group එක respectful ලෙස භාවිතා කරන්න.',
    '',
    '© 2026 <b>Cine Universe</b>. All Rights Reserved.'
  ].join('\n');

  const logoPath=path.join(process.cwd(),'public','cine-universe-logo.jpg');
  const keyboard={inline_keyboard:[
    [{text:'📢 Official Update Channel',url:process.env.TELEGRAM_CHANNEL_URL||'https://t.me/dinidu20030304'}],
    [{text:'🤖 Open Cine Universe Bot',url:process.env.TELEGRAM_BOT_URL||`https://t.me/${BOT_USERNAME}`}]
  ]};

  try{
    const photo=await fs.readFile(logoPath);
    const form=new FormData();
    form.append('chat_id',String(message.chat.id));
    form.append('photo',new Blob([photo],{type:'image/jpeg'}),'cine-universe-logo.jpg');
    form.append('caption',text);
    form.append('parse_mode','HTML');
    form.append('reply_markup',JSON.stringify(keyboard));

    const token=process.env.TELEGRAM_BOT_TOKEN;
    if(!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured.');
    const response=await fetch(`https://api.telegram.org/bot${token}/sendPhoto`,{method:'POST',body:form});
    const data=await response.json();
    if(!response.ok||!data.ok) throw new Error(data?.description||`Telegram HTTP ${response.status}`);
    return {handled:true,welcome:true,count:members.length};
  }catch(err){
    console.warn('[telegram-listener] welcome photo failed, sending text fallback:',err.message||err);
    await telegramSendMessage(message.chat.id,text,{inline_keyboard:keyboard});
    return {handled:true,welcome:true,count:members.length,fallback:true};
  }
}


async function startUnifiedTelegramListener() {
  if (!AUTO_PUBLISH || channelPollRunning) return;
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.warn('[telegram-listener] disabled: TELEGRAM_BOT_TOKEN missing.');
    return;
  }
  channelPollRunning = true;
  try { await resolveMovieAndUpdateChannels(); }
  catch (err) { console.error('[telegram-listener] Channel A/B resolve failed:', err.message || err); channelPollRunning = false; return; }
  const groupId=String(process.env.MOVIE_REQUEST_GROUP_CHAT_ID||'').trim();
  let offset=await loadTelegramOffset();
  let retryMs=TELEGRAM_RETRY_BASE_MS;
  console.log(`[telegram-listener] Channel A: ${MOVIE_UPLOAD_CHANNEL_CHAT_ID}`);
  console.log(`[telegram-listener] Channel B: ${UPDATE_CHANNEL_CHAT_ID}`);
  console.log(`[telegram-listener] Request group: ${groupId||'ALL visible groups'}`);
  console.log(`[telegram-listener] ONE getUpdates consumer active. Starting offset: ${offset}`);
  while(channelPollRunning){
    try{
      const data=await telegramGetUpdates(process.env.TELEGRAM_BOT_TOKEN,offset);
      retryMs=TELEGRAM_RETRY_BASE_MS;
      for(const update of data.result||[]){
        const nextOffset=Number(update.update_id)+1;
        try{
          if(update.channel_post){
            let result=await publishTvUpdate(update.channel_post); if(result?.skipped && result.reason==='not_tv_episode') result=await publishMovieUpdateFromChannelPost(update.channel_post);
            if(!result.skipped) console.log('[telegram-listener] A -> B:',result);
          } else if(update.callback_query){
            await handleMovieCallback(update.callback_query);
          } else if(update.message){
            const botWelcomeResult=await sendBotWelcome(update.message);
            if(botWelcomeResult?.handled){
              console.log('[telegram-listener] bot welcome:',botWelcomeResult);
            } else {
              const welcomeResult=await sendGroupWelcome(update.message);
              if(welcomeResult?.handled) {
                console.log('[telegram-listener] group welcome:',welcomeResult);
              } else if(!groupId || String(update.message.chat?.id)===groupId){
                const processingMessageId=await sendGroupProcessingMessage(update.message);
                try{
                  let result=await handleGroupTvRequest(update.message); if(result?.handled!==true) result=await handleGroupMovieRequest(update.message);
                  if(result?.handled) console.log('[telegram-listener] group request:',result);
                }finally{
                  if(processingMessageId){
                    try{await telegramDeleteMessage(update.message.chat.id,processingMessageId);}catch{}
                  }
                }
              }
            }
          }
          offset=nextOffset;
          await saveTelegramOffset(offset);
        } catch(err){
          console.error('[telegram-listener] update failed:',err.message||err);
          offset=nextOffset;
          await saveTelegramOffset(offset);
        }
      }
    } catch(err){
      const msg=err?.name==='AbortError'?'Telegram long-poll timed out; reconnecting.':(err.message||String(err));
      console.error(`[telegram-listener] polling error: ${msg}`);
      await new Promise(r=>setTimeout(r,retryMs));
      retryMs=Math.min(retryMs*2,TELEGRAM_RETRY_MAX_MS);
    }
  }
}
restoreFileExpiryJobs().catch(err=>console.error('[telegram-listener] expiry restore failed:',err));
startUnifiedTelegramListener().catch(err => console.error('[telegram-listener] startup error:', err));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Cine Universe API running on http://localhost:${PORT}`);
});
