import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=process.cwd();
const MOVIE_FILE=path.join(ROOT,'server','published-catalog.json');
const TV_FILE=path.join(ROOT,'server','published-tv-catalog.json');
const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const SUPABASE_KEY=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
const CACHE_MS=30_000;
let cache={time:0,movies:[],tv:[]};

function normalizeText(value){
  return String(value??'')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s]/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

function tokens(value){
  return normalizeText(value).split(' ').filter(t=>t.length>=2);
}

function yearOf(item){
  return String(item?.year||item?.release_date||item?.first_air_date||'').match(/\b(?:19|20)\d{2}\b/)?.[0]||'';
}

function toResult(item,type){
  const mediaType=type==='tv'?'tv':'movie';
  return {
    ...item,
    mediaType:item.mediaType||mediaType,
    type:item.type||(mediaType==='tv'?'TV Series':'Movie'),
    published:true,
    source:'cine-universe-database'
  };
}

async function remoteCatalog(key){
  if(!SUPABASE_URL||!SUPABASE_KEY) return {};
  const url=`${SUPABASE_URL}/rest/v1/cine_runtime_state?key=eq.${encodeURIComponent(key)}&select=payload&limit=1`;
  const response=await fetch(url,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`}});
  if(!response.ok) throw new Error(`Supabase ${key} HTTP ${response.status}`);
  const rows=await response.json();
  const payload=rows?.[0]?.payload;
  return payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{};
}

async function localCatalog(file){
  try{
    const data=JSON.parse(await fs.readFile(file,'utf8'));
    return data&&typeof data==='object'&&!Array.isArray(data)?data:{};
  }catch{return {};}
}

async function loadCatalogs(){
  if(Date.now()-cache.time<CACHE_MS && (cache.movies.length||cache.tv.length)) return cache;
  let movies={},tv={};
  try{
    [movies,tv]=await Promise.all([remoteCatalog('movieCatalog'),remoteCatalog('tvCatalog')]);
  }catch(error){
    console.warn('[catalog-search] Supabase catalog read failed; using local catalog:',error.message||error);
    [movies,tv]=await Promise.all([localCatalog(MOVIE_FILE),localCatalog(TV_FILE)]);
  }

  cache={
    time:Date.now(),
    movies:Object.values(movies).map(x=>toResult(x,'movie')).filter(x=>x.status!=='unpublished'),
    tv:Object.values(tv).map(x=>toResult(x,'tv')).filter(x=>x.status!=='unpublished')
  };
  return cache;
}

function scoreItem(item,query,requestedYear){
  const title=normalizeText(item.title||item.name||item.originalTitle||item.original_name||'');
  const original=normalizeText(item.originalTitle||item.original_name||'');
  const aliases=[title,original].filter(Boolean);
  const q=normalizeText(query);
  const qTokens=tokens(query);
  const titleTokens=tokens(title);
  if(!title||!qTokens.length) return -1;

  let score=0;
  if(title===q) score+=2000;
  if(original===q) score+=1800;
  if(title.startsWith(q)) score+=900;
  if(title.includes(q)) score+=650;

  let matched=0;
  for(const token of qTokens){
    const exact=titleTokens.includes(token)||tokens(original).includes(token);
    const prefix=titleTokens.some(t=>t.startsWith(token)||token.startsWith(t));
    if(exact){score+=180;matched++;continue;}
    if(prefix){score+=90;matched++;}
  }

  const coverage=matched/qTokens.length;
  if(coverage<0.55 && !title.includes(q)) return -1;
  score+=coverage*500;

  const year=yearOf(item);
  if(requestedYear){
    if(year===requestedYear) score+=700;
    else score-=500;
  }

  score+=Math.min(Number(item.popularity||0),100)*0.5;
  if(item.poster||item.poster_url) score+=20;
  if(item.qualities && Object.keys(item.qualities).length) score+=25;

  return score;
}

export async function searchPublishedCatalog(query,{limit=8}={}){
  const raw=String(query||'').trim();
  if(raw.length<2) return {results:[],total:0,source:'cine-universe-database'};

  const year=raw.match(/\b(?:19|20)\d{2}\b/)?.[0]||'';
  const qNoYear=raw.replace(/\b(?:19|20)\d{2}\b/g,' ').replace(/\s+/g,' ').trim();
  const {movies,tv}=await loadCatalogs();
  const ranked=[];

  for(const item of [...movies,...tv]){
    const score=scoreItem(item,qNoYear||raw,year);
    if(score<0) continue;
    ranked.push({item,score});
  }

  ranked.sort((a,b)=>b.score-a.score||String(a.item.title||'').localeCompare(String(b.item.title||'')));

  const seen=new Set();
  const results=[];
  for(const row of ranked){
    const key=`${row.item.mediaType}:${row.item.tmdbId||row.item.id||row.item.title}`;
    if(seen.has(key)) continue;
    seen.add(key);
    results.push({...row.item,searchScore:Math.round(row.score)});
    if(results.length>=Math.max(1,Math.min(12,Number(limit)||8))) break;
  }

  return {results,total:ranked.length,source:'cine-universe-database'};
}
