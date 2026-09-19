const STOP = new Set(['sinhala','sinhalese','subtitle','subtitles','subs','eng','english','web','webrip','webdl','bluray','brrip','x264','x265','h264','h265','hevc','aac','ddp','atmos','multi','dual','audio','proper','repack','retail','unrated','extended','remastered']);

export function parseSubtitleFilename(fileName='') {
  const raw=String(fileName||'').trim();
  const base=raw.replace(/\.(srt|ass|ssa|vtt)$/i,'');
  const se=base.match(/(?:^|[._\-\s])S(\d{1,2})[._\-\s]*E(\d{1,3})(?:$|[._\-\s])/i);
  const season=se?Number(se[1]):null;
  const episode=se?Number(se[2]):null;
  const yearMatch=base.match(/\b((?:19|20)\d{2})\b/);
  const year=yearMatch?Number(yearMatch[1]):null;
  const title=base
    .replace(/S\d{1,2}[._\-\s]*E\d{1,3}/ig,' ')
    .replace(/\b(?:season|s)\s*\d{1,2}\b/ig,' ')
    .replace(/\b(?:episode|ep|e)\s*\d{1,3}\b/ig,' ')
    .replace(/\b((?:19|20)\d{2})\b/g,' ')
    .split(/[._\-]+/).join(' ')
    .split(/\s+/).filter(Boolean).filter(x=>!STOP.has(x.toLowerCase())).join(' ')
    .trim();
  const ext=(raw.match(/\.(srt|ass|ssa|vtt)$/i)?.[1]||'srt').toUpperCase();
  return {title,year,season,episode,format:ext,fileName:raw};
}

export function normalizeTitle(value='') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
