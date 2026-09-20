import React, { useState } from "react";
import "./manual-movie-admin.css";

export default function ManualMovieManager({ adminApi, onSaved }) {
  const [tmdbId, setTmdbId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [movie, setMovie] = useState(null);

  const addMovie = async () => {
    if (!tmdbId.trim()) {
      setMessage("Enter a TMDB movie ID first.");
      return;
    }

    try {
      setBusy(true);
      setMessage("Adding movie to Cine Universe database…");
      const result = await adminApi("/admin/manual-movies", {
        method: "POST",
        body: JSON.stringify({ tmdbId: tmdbId.trim() })
      });

      setMovie(result.movie || null);
      setMessage(
        result.action === "updated"
          ? "✅ Movie already existed — database entry refreshed."
          : "✅ Movie added to Cine Universe database."
      );
      setTmdbId("");
      await onSaved?.(result.movie);
    } catch (error) {
      setMessage("❌ " + (error.message || "Could not add movie."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="manual-movie-admin glass">
      <div className="manual-movie-head">
        <div>
          <span className="manual-movie-kicker">MANUAL CONTENT</span>
          <h3>➕ Add Movie</h3>
          <p>Add a movie manually to the Cine Universe database, without waiting for Telegram auto-detection.</p>
        </div>
        <span className="manual-movie-icon">🎬</span>
      </div>

      <div className="manual-movie-form">
        <label>
          TMDB Movie ID
          <input
            inputMode="numeric"
            placeholder="e.g. 27205"
            value={tmdbId}
            onChange={(event) => setTmdbId(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !busy) addMovie();
            }}
          />
          <small>You can also paste a full TMDB movie URL.</small>
        </label>

        <button
          type="button"
          className="primary-btn manual-movie-add"
          disabled={busy}
          onClick={addMovie}
        >
          {busy ? "Adding…" : "➕ Add to Database"}
        </button>
      </div>

      {message && <div className="manual-movie-message">{message}</div>}

      {movie && (
        <div className="manual-movie-preview">
          {movie.poster ? (
            <img src={movie.poster} alt="" loading="lazy" referrerPolicy="no-referrer" />
          ) : (
            <div className="manual-movie-fallback">🎬</div>
          )}
          <div>
            <strong>{movie.title}</strong>
            <span>{movie.year} • Movie • ⭐ {movie.rating || "—"}</span>
            <small>✓ Now available in Search & Movie catalog</small>
          </div>
        </div>
      )}
    </div>
  );
}
