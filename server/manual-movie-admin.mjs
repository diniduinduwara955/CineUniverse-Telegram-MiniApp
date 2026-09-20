
const MANUAL_QUALITY_ORDER = ['4K', '1080P', '720P', '480P'];
const MANUAL_UPDATE_CHANNEL = String(process.env.UPDATE_CHANNEL_CHAT_ID || '').trim();
const MANUAL_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
const MANUAL_BOT_USERNAME = String(process.env.TELEGRAM_BOT_USERNAME || 'CINE_UNIVERSE_OFFCIALS_BOT').replace(/^@/, '');
const MANUAL_MINI_APP_URL = String(process.env.MINI_APP_URL || '').trim();
const MANUAL_UPLOAD_CHANNEL = String(process.env.MOVIE_UPLOAD_CHANNEL_CHAT_ID || '').trim();
const MANUAL_POSTER_BASE = 'https://image.tmdb.org/t/p/w500';
const MANUAL_BACKDROP_BASE = 'https://image.tmdb.org/t/p/original';

function manualHtmlEscape(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function manualMiniAppUrl(id) {
  if (!MANUAL_MINI_APP_URL) return '';
  const joiner = MANUAL_MINI_APP_URL.includes('?') ? '&' : '?';
  return MANUAL_MINI_APP_URL + joiner + 'movie=' + encodeURIComponent(id);
}

async function manualTelegram(method, payload) {
  if (!MANUAL_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is not configured.');
  const response = await fetch('https://api.telegram.org/bot' + MANUAL_BOT_TOKEN + '/' + method, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data?.description || ('Telegram HTTP ' + response.status));
  return data.result;
}

function manualQualityRows(downloads, mediaId) {
  const available = MANUAL_QUALITY_ORDER.filter(q => downloads['movie:' + mediaId + ':' + q]?.channel_message_id);
  const rows = [];
  for (let i = 0; i < available.length; i += 2) {
    rows.push(available.slice(i, i + 2).map(q => ({
      text: '⬇️ ' + q,
      callback_data: 'movie:' + mediaId + ':' + q
    })));
  }
  return rows;
}

function manualMovieUpdateText(movie, quality) {
  const title = movie.title || movie.original_title || 'Movie';
  const year = String(movie.release_date || '').slice(0, 4);
  const imdb = String(movie.imdbRating || '').trim();
  const genres = (movie.genres || []).map(g => g.name).filter(Boolean).slice(0, 2);
  const cast = (movie.credits?.cast || []).slice(0, 3).map(x => x.name).filter(Boolean);
  const overview = String(movie.overview || '').trim();
  const shortOverview = overview.length > 110 ? overview.slice(0, 107).trimEnd() + '…' : overview;

  return [
    '🎬 <b>CINE UNIVERSE</b>',
    '🔥 <b>' + manualHtmlEscape(title) + '</b>' + (year ? ' • ' + manualHtmlEscape(year) : ''),
    imdb ? '⭐ <b>IMDb</b> ' + manualHtmlEscape(imdb) + '/10' : '⭐ <b>IMDb</b> —',
    genres.length ? '🎭 ' + manualHtmlEscape(genres.join(' • ')) : '',
    cast.length ? '👥 ' + manualHtmlEscape(cast.join(' • ')) : '',
    shortOverview ? '📝 ' + manualHtmlEscape(shortOverview) : '',
    '',
    '📥 <b>' + manualHtmlEscape(quality) + ' added manually</b>',
    '✨ <b>Cine Universe Official</b>'
  ].filter(Boolean).join('\n');
}

function parseTmdbMovieId(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/(?:themoviedb\.org\/(?:movie|tv)\/|^)(\d+)/i);
  const id = Number(match?.[1] || 0);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

export function registerManualMovieAdmin({
  app,
  requireAdmin,
  loadCatalog,
  saveCatalog,
  loadDownloadMap,
  movieDetailsWithCredits,
  getImdbMetadata,
  buildCatalogEntry
}) {

  app.post('/api/admin/manual-movie-file', async (req, res) => {
    if (!requireAdmin(req, res)) return;

    try {
      const tmdbId = parseTmdbMovieId(req.body?.tmdbId);
      const sourceChatId = String(req.body?.sourceChatId || MANUAL_UPLOAD_CHANNEL).trim();
      const messageId = Number(req.body?.messageId || 0);
      const quality = String(req.body?.quality || '').toUpperCase().trim();
      const size = String(req.body?.size || '').trim();

      if (!tmdbId) return res.status(400).json({ ok: false, error: 'Enter a valid TMDB Movie ID or URL.' });
      if (!sourceChatId) return res.status(400).json({ ok: false, error: 'Movie Upload Channel ID is not configured.' });
      if (!Number.isInteger(messageId) || messageId <= 0) return res.status(400).json({ ok: false, error: 'Enter the Telegram file message ID.' });
      if (!MANUAL_QUALITY_ORDER.includes(quality)) return res.status(400).json({ ok: false, error: 'Select 4K, 1080P, 720P or 480P.' });

      const details = await movieDetailsWithCredits(tmdbId);
      const title = String(details?.title || details?.original_title || '').trim();
      if (!title) return res.status(404).json({ ok: false, error: 'TMDB movie was not found.' });

      const downloads = await loadDownloadMap();
      const key = 'movie:' + tmdbId + ':' + quality;
      const previous = downloads[key] || {};

      downloads[key] = {
        ...previous,
        channel_chat_id: sourceChatId,
        channel_message_id: messageId,
        title,
        year: String(details.release_date || '').slice(0, 4),
        poster: details.poster_path ? MANUAL_POSTER_BASE + details.poster_path : '',
        backdrop: details.backdrop_path ? MANUAL_BACKDROP_BASE + details.backdrop_path : '',
        size: size || previous.size || '',
        updated_at: new Date().toISOString(),
        manually_added: true
      };

      const catalog = await loadCatalog();
      const imdb = await getImdbMetadata(details);
      const entry = buildCatalogEntry(details, downloads, tmdbId, imdb);
      const existing = catalog[String(tmdbId)];

      const merged = {
        ...(existing || {}),
        ...entry,
        source: existing?.source || 'manual-admin',
        manuallyAdded: true,
        manuallyAddedAt: existing?.manuallyAddedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      catalog[String(tmdbId)] = merged;
      await saveCatalog(catalog);

      let updateMessageId = null;
      let updatePublished = false;
      let updateError = '';

      if (MANUAL_UPDATE_CHANNEL && details.poster_path) {
        try {
          const rows = manualQualityRows(downloads, tmdbId);
          const mini = manualMiniAppUrl(tmdbId);
          if (mini) rows.push([{ text: '🎬 Open in Mini App', url: mini }]);
          rows.push([{ text: '🤖 Open ' + MANUAL_BOT_USERNAME, url: 'https://t.me/' + MANUAL_BOT_USERNAME }]);

          const sent = await manualTelegram('sendPhoto', {
            chat_id: MANUAL_UPDATE_CHANNEL,
            photo: MANUAL_POSTER_BASE + details.poster_path,
            caption: manualMovieUpdateText(details, quality),
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: rows }
          });

          updateMessageId = Number(sent?.message_id || 0) || null;
          updatePublished = Boolean(updateMessageId);
        } catch (error) {
          updateError = error.message || 'Telegram update failed.';
          console.warn('[manual-movie-admin] update channel publish failed:', updateError);
        }
      } else if (!MANUAL_UPDATE_CHANNEL) {
        updateError = 'UPDATE_CHANNEL_CHAT_ID is not configured.';
      } else if (!details.poster_path) {
        updateError = 'TMDB movie has no poster, so the update channel post was skipped.';
      }

      return res.json({
        ok: true,
        action: previous?.channel_message_id ? 'updated' : 'created',
        movie: merged,
        file: { quality, sourceChatId, messageId, size: downloads[key].size || '' },
        update: { published: updatePublished, messageId: updateMessageId, error: updateError || null }
      });
    } catch (error) {
      console.error('[manual-movie-admin] manual file add failed:', error.message || error);
      return res.status(error.status || 500).json({ ok: false, error: error.message || 'Could not add the movie file.' });
    }
  });

  app.post('/api/admin/manual-movies', async (req, res) => {
    if (!requireAdmin(req, res)) return;

    try {
      const tmdbId = parseTmdbMovieId(req.body?.tmdbId);
      if (!tmdbId) {
        return res.status(400).json({
          ok: false,
          error: 'Enter a valid TMDB movie ID or TMDB movie URL.'
        });
      }

      const details = await movieDetailsWithCredits(tmdbId);
      const title = String(details?.title || details?.original_title || '').trim();
      if (!title) {
        return res.status(404).json({
          ok: false,
          error: 'TMDB movie was not found.'
        });
      }

      const catalog = await loadCatalog();
      const downloads = await loadDownloadMap();
      const imdb = await getImdbMetadata(details);
      const entry = buildCatalogEntry(details, downloads, tmdbId, imdb);
      const existing = catalog[String(tmdbId)];

      const merged = {
        ...(existing || {}),
        ...entry,
        source: 'manual-admin',
        manuallyAdded: true,
        manuallyAddedAt: existing?.manuallyAddedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      catalog[String(tmdbId)] = merged;
      await saveCatalog(catalog);

      return res.json({
        ok: true,
        action: existing ? 'updated' : 'created',
        movie: merged
      });
    } catch (error) {
      console.error('[manual-movie-admin] add failed:', error.message || error);
      return res.status(500).json({
        ok: false,
        error: error.message || 'Could not add the movie.'
      });
    }
  });
}
