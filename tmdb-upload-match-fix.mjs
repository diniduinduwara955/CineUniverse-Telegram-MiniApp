import fs from 'node:fs/promises';
import path from 'node:path';

const SERVER_FILE = path.join(process.cwd(), 'server.js');

const OLD_CLEAN_BLOCK = `.replace(/\\b(?:bluray|blu-ray|brrip|br-rip|webrip|web-rip|web-dl|webdl|hdtv|dvdrip|remux|hdr10\\+?|hdr|dv|dolby.?vision|x264|x265|h264|h265|hevc|av1|aac|ddp\\d*|dd\\d*|atmos|5\\.1|7\\.1|proper|repack|extended|uncut|yify|yts|rarbg|nf|amzn|multi|dual.?audio|subs?|eng|english)\\b/gi,' ')\n    .replace(/\\b(?:19|20)\\d{2}\\b/g,' ').replace(/[._-]+/g,' ').replace(/\\s+/g,' ').trim();`;

const NEW_CLEAN_BLOCK = `.replace(/\\b(?:bluray|blu-ray|brrip|br-rip|webrip|web-rip|web-dl|webdl|hdtv|dvdrip|remux|hdr10\\+?|hdr|dv|dolby.?vision|x264|x265|h264|h265|hevc|av1|aac|ddp\\d*|dd\\d*|atmos|5\\.1|7\\.1|proper|repack|extended|uncut|yify|yts|rarbg|nf|amzn|multi|dual.?audio|subs?|eng|english)\\b/gi,' ')\n    .replace(/^(?:www\\.)?1tamilmv(?:\\.[a-z0-9-]+)*\\s*[-:|]+\\s*/i,' ')\n    .replace(/\\b(?:19|20)\\d{2}\\b/g,' ').replace(/[._-]+/g,' ').replace(/\\s+/g,' ').trim();`;

const OLD_VARIANT_BLOCK = `    push(q);\n\n    // Remove common non-title words that may poison TMDB search.`;
const NEW_VARIANT_BLOCK = `    push(q);\n\n    // Release-name cleanup for filenames like "Newton s 3rd Law".\n    // Keep the original query intact and add only a safer extra variant.\n    const loosePossessive = q.replace(/\\b([a-z][a-z0-9'-]{2,})\\s+s\\b/gi,'$1');\n    push(loosePossessive);\n\n    // Remove common non-title words that may poison TMDB search.`;

export async function applyTmdbUploadMatchFix() {
  let source = await fs.readFile(SERVER_FILE, 'utf8');
  let changed = false;

  if (source.includes(NEW_CLEAN_BLOCK) && source.includes(NEW_VARIANT_BLOCK)) {
    console.log('[tmdb-match-fix] already applied');
    return;
  }

  if (source.includes(OLD_CLEAN_BLOCK)) {
    source = source.replace(OLD_CLEAN_BLOCK, NEW_CLEAN_BLOCK);
    changed = true;
  }

  if (source.includes(OLD_VARIANT_BLOCK)) {
    source = source.replace(OLD_VARIANT_BLOCK, NEW_VARIANT_BLOCK);
    changed = true;
  }

  if (!changed) {
    throw new Error('Expected server.js movie matching blocks were not found; no changes made.');
  }

  await fs.writeFile(SERVER_FILE, source, 'utf8');
  console.log('[tmdb-match-fix] applied isolated upload-title matching fix');
}
