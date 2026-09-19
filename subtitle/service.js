import {normalizeTitle} from './parser.js';
import {findSubtitle,addNotification} from './supabase.js';

export function parseSearchQuery(input=''){
  const raw=String(input).trim();
  const se=raw.match(/(?:^|\s)S(\d{1,2})E(\d{1,3})(?:$|\s)/i);
  let season=se?Number(se[1]):null, episode=se?Number(se[2]):null;
  const ep=raw.match(/(?:^|\s)season\s*(\d{1,2})\s*(?:episode|ep|e)\s*(\d{1,3})(?:$|\s)/i);
  if(!se && ep){season=Number(ep[1]);episode=Number(ep[2]);}
  const title=raw.replace(/(?:^|\s)S\d{1,2}E\d{1,3}(?=$|\s)/ig,' ').replace(/\s+/g,' ').trim();
  return {raw,title,season,episode,normalizedTitle:normalizeTitle(title)};
}
export async function searchSubtitle(query,{tmdbId=null,year=null}={}){
  return findSubtitle({tmdbId,year,season:query.season,episode:query.episode,language:'Sinhala'});
}
export async function requestSubtitleNotification({userId,tmdbId,title,year,season,episode}){
  return addNotification({unique_key:[userId,tmdbId||0,title,year||0,season??0,episode??0,'Sinhala'].join(':'),user_id:String(userId),tmdb_id:tmdbId,title,year,season,episode,language:'Sinhala',notified:false});
}
