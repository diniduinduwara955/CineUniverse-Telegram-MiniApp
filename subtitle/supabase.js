const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const KEY=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();

function enabled(){ return Boolean(SUPABASE_URL && KEY); }
async function request(path, options={}) {
  if(!enabled()) throw new Error('Supabase environment is not configured.');
  const res=await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers:{apikey:KEY,Authorization:`Bearer ${KEY}`,'content-type':'application/json',...(options.headers||{})}
  });
  if(!res.ok) throw new Error(`Supabase HTTP ${res.status}`);
  return res;
}

export async function upsertSubtitle(row){
  await request('cine_subtitles?on_conflict=unique_key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(row)});
}
export async function findSubtitle({tmdbId,year,season,episode,language='Sinhala'}){
  const f=[];
  if(tmdbId) f.push(`tmdb_id=eq.${encodeURIComponent(tmdbId)}`);
  if(year) f.push(`year=eq.${encodeURIComponent(year)}`);
  if(season!=null) f.push(`season=eq.${encodeURIComponent(season)}`);
  if(episode!=null) f.push(`episode=eq.${encodeURIComponent(episode)}`);
  f.push(`language=eq.${encodeURIComponent(language)}`);
  const res=await request(`cine_subtitles?select=*&order=created_at.desc&limit=10&${f.join('&')}`);
  const rows=await res.json();
  return rows?.[0]||null;
}
export async function addNotification(row){
  await request('cine_subtitle_notifications?on_conflict=unique_key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(row)});
}
export async function listPendingNotificationsForSubtitle({tmdbId,season,episode,language='Sinhala'}){
  const f=[`tmdb_id=eq.${encodeURIComponent(tmdbId)}`,`language=eq.${encodeURIComponent(language)}`,`notified=eq.false`];
  if(season!=null) f.push(`season=eq.${encodeURIComponent(season)}`);
  if(episode!=null) f.push(`episode=eq.${encodeURIComponent(episode)}`);
  const res=await request(`cine_subtitle_notifications?select=*&limit=200&${f.join('&')}`);
  return await res.json();
}
export async function markNotificationSent(id){
  await request(`cine_subtitle_notifications?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({notified:true,notified_at:new Date().toISOString()})});
}
