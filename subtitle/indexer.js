import {parseSubtitleFilename,normalizeTitle} from './parser.js';
import {upsertSubtitle,listPendingNotificationsForSubtitle,markNotificationSent} from './supabase.js';

function extractFile(post){
  const d=post?.document;
  const fileName=String(d?.file_name||'');
  if(!d || !/\.(srt|ass|ssa|vtt)$/i.test(fileName)) return null;
  return {fileId:String(d.file_id||''),fileUniqueId:String(d.file_unique_id||''),fileName};
}
export async function indexSubtitlePost(post,onNotify){
  const f=extractFile(post);
  if(!f) return {handled:false};
  const m=parseSubtitleFilename(f.fileName);
  if(!m.title) return {handled:false,reason:'empty_title'};
  const row={
    unique_key:[normalizeTitle(m.title),m.year||0,m.season??0,m.episode??0,m.format].join(':'),
    tmdb_id:null,title:m.title,normalized_title:normalizeTitle(m.title),year:m.year,season:m.season,episode:m.episode,
    language:'Sinhala',format:m.format,telegram_channel_id:String(post?.chat?.id||''),telegram_message_id:Number(post?.message_id||0),
    telegram_file_id:f.fileId,telegram_file_unique_id:f.fileUniqueId,file_name:f.fileName
  };
  await upsertSubtitle(row);
  if(onNotify){
    const pending=await listPendingNotificationsForSubtitle({tmdbId:row.tmdb_id,season:row.season,episode:row.episode});
    for(const n of pending){
      try{await onNotify(n,row);await markNotificationSent(n.id);}catch(err){console.warn('[subtitle] notify failed',err.message||err);}
    }
  }
  return {handled:true,row};
}
