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
