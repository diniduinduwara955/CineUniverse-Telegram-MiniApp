import React, { useState } from "react";
import "./search-results.css";

function resolvePoster(movie) {
  const raw = String(
    movie?.poster ||
    movie?.poster_url ||
    movie?.posterUrl ||
    (movie?.poster_path ? `https://image.tmdb.org/t/p/w300${movie.poster_path}` : "")
  ).trim();

  if (!raw) return "";
  if (/^https?:\/\//i.test(raw) || raw.startsWith("//")) return raw;
  if (raw.startsWith("/")) return raw;
  return `/${raw.replace(/^\.?\//, "")}`;
}

export default function SearchResultCard({ movie, onOpen }) {
  const [imageFailed, setImageFailed] = useState(false);
  const poster = resolvePoster(movie);
  const title = String(movie?.title || movie?.name || "Untitled");
  const year = String(movie?.year || movie?.release_date || movie?.first_air_date || "—");
  const type = movie?.mediaType === "tv" || movie?.type === "TV Series" ? "TV Series" : "Movie";
  const rating = movie?.rating || movie?.vote_average || "—";
  const initial = title.trim().charAt(0).toUpperCase() || "C";

  return (
    <button
      type="button"
      className="cu-search-result-card"
      onClick={() => onOpen?.(movie)}
      aria-label={`Open ${title}`}
    >
      <div className="cu-search-result-thumb">
        {poster && !imageFailed ? (
          <img
            src={poster}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span>{initial}</span>
        )}
      </div>

      <div className="cu-search-result-info">
        <strong title={title}>{title}</strong>
        <span>{year} • {type}</span>
        <small>⭐ {rating}</small>
      </div>

      <span className="cu-search-result-arrow">›</span>
    </button>
  );
}
