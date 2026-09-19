export function renderSearchStarted({title,season,episode}){
  return ['🎬 𝑺𝑰𝑵𝑯𝑨𝑳𝑨 𝑺𝑼𝑩𝑻𝑰𝑻𝑳𝑬 𝑺𝑬𝑨𝑹𝑪𝑯','━━━━━━━━━━━━━━━━━━━━','',
    '🔎 𝑺𝒆𝒂𝒓𝒄𝒉𝒊𝒏𝒈',title,'',
    season!=null&&episode!=null?`📺 Season ${String(season).padStart(2,'0')} • Episode ${String(episode).padStart(2,'0')}`:'' ,'',
    '🔍 Identifying title... 🟢','🇱🇰 Searching Sinhala subtitles... 🟡','',
    '━━━━━━━━━━━━━━━━━━━━','⏳ 𝑷𝒍𝒆𝒂𝒔𝒆 𝑾𝒂𝒊𝒕...'].filter(Boolean).join('\\n');
}
export function renderFound({title,year,rating,season,episode,format='SRT',match='99%',fileName}){
  return ['🎬 𝑺𝑰𝑵𝑯𝑨𝑳𝑨 𝑺𝑼𝑩𝑻𝑰𝑻𝑳𝑬 𝑺𝑬𝑨𝑹𝑪𝑯','━━━━━━━━━━━━━━━━━━━━','',
    '🔎 𝑺𝒆𝒂𝒓𝒄𝒉 𝑹𝒆𝒔𝒖𝒍𝒕',title,'',
    season!=null&&episode!=null?'📺 𝑺𝒆𝒓𝒊𝒆𝒔 𝑰𝒏𝒇𝒐':'🎬 𝑴𝒐𝒗𝒊𝒆 𝑰𝒏𝒇𝒐',
    season!=null&&episode!=null?`𝑺𝒆𝒂𝒔𝒐𝒏 ${String(season).padStart(2,'0')} • 𝑬𝒑𝒊𝒔𝒐𝒅𝒆 ${String(episode).padStart(2,'0')}`:'' ,
    year?`📅 ${year}`: '',rating?`⭐ TMDB ${rating} / 10`: '',
    '', '🇱🇰 𝑺𝒖𝒃𝒕𝒊𝒕𝒍𝒆 𝑰𝒏𝒇𝒐','Language  •  Sinhala',`Format    •  ${format}`,`Match     •  ${match}`,'Status    •  🟢 Available','',
    '📥 𝑫𝒐𝒘𝒏𝒍𝒐𝒂𝒅','👇 Your subtitle is ready.',fileName?`📄 ${fileName}`:'','',
    '[ 📥 𝑫𝑶𝑾𝑵𝑳𝑶𝑨𝑫 ]','','━━━━━━━━━━━━━━━━━━━━',
    '⚡ 𝑷𝒐𝒘𝒆𝒓𝒆𝒅 𝒃𝒚 𝑺𝒖𝒃𝒕𝒊𝒕𝒍𝒆 𝑺𝒚𝒔𝒕𝒆𝒎','© 𝑫𝒊𝒏𝒊𝒅𝒖 𝑰𝒏𝒅𝒖𝒘𝒂𝒓𝒂'].filter(Boolean).join('\\n');
}
export function renderNotFound({title,year,rating,season,episode}){
  return ['⚠️ 𝑺𝑼𝑩𝑻𝑰𝑻𝑳𝑬 𝑵𝑶𝑻 𝑭𝑶𝑼𝑵𝑫','━━━━━━━━━━━━━━━━━━━━','',
    '🔎 𝑺𝒆𝒂𝒓𝒄𝒉 𝑹𝒆𝒔𝒖𝒍𝒕',title,'',
    season!=null&&episode!=null?`📺 Season ${String(season).padStart(2,'0')} • Episode ${String(episode).padStart(2,'0')}`:'🎬 𝑴𝒐𝒗𝒊𝒆',
    year?`📅 ${year}`:'',rating?`⭐ TMDB ${rating} / 10`:'','',
    '🇱🇰 𝑺𝒖𝒃𝒕𝒊𝒕𝒍𝒆 𝑺𝒕𝒂𝒕𝒖𝒔','Language  •  Sinhala','Status    •  🔴 Not Available','',
    '━━━━━━━━━━━━━━━━━━━━','','🔔 𝑵𝒐𝒕𝒊𝒇𝒚 𝑴𝒆','Get a notification when the Sinhala subtitle becomes available.','',
    '[ 🔔 𝑵𝑶𝑻𝑰𝑭𝒀 𝑴𝑬 ]','','━━━━━━━━━━━━━━━━━━━━',
    '⚡ 𝑷𝒐𝒘𝒆𝒓𝒆𝒅 𝒃𝒚 𝑺𝒖𝒃𝒕𝒊𝒕𝒍𝒆 𝑺𝒚𝒔𝒕𝒆𝒎','© 𝑫𝒊𝒏𝒊𝒅𝒖 𝑰𝒏𝒅𝒖𝒘𝒂𝒓𝒂'].filter(Boolean).join('\\n');
}
