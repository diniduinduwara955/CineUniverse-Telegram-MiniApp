import React, { useState } from "react";
import "./manual-movie-admin.css";

const QUALITY = ["4K", "1080P", "720P", "480P"];

export default function ManualMovieManager({ adminApi, onSaved }) {
  const [form, setForm] = useState({
    tmdbId: "",
    messageId: "",
    sourceChatId: "",
    quality: "1080P",
    size: ""
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [movie, setMovie] = useState(null);
  const [updateInfo, setUpdateInfo] = useState(null);

  const setField = (key, value) => setForm(current => ({ ...current, [key]: value }));

  const addMovieFile = async () => {
    if (!form.tmdbId.trim()) return setMessage("Enter the TMDB Movie ID first.");
    if (!form.messageId.trim()) return setMessage("Enter the Telegram file message ID.");
    if (!form.sourceChatId.trim()) return setMessage("Enter the Movie Upload Channel ID.");

    try {
      setBusy(true);
      setMessage("Adding movie + Telegram file to the Cine Universe database…");
      setUpdateInfo(null);

      const result = await adminApi("/admin/manual-movie-file", {
        method: "POST",
        body: JSON.stringify({
          tmdbId: form.tmdbId.trim(),
          messageId: Number(form.messageId),
          sourceChatId: form.sourceChatId.trim(),
          quality: form.quality,
          size: form.size.trim()
        })
      });

      setMovie(result.movie || null);
      setUpdateInfo(result.update || null);

      const updateText = result.update?.published
        ? " • 📢 Update channel posted"
        : result.update?.error
          ? " • ⚠️ Database saved, channel update failed"
          : "";

      setMessage(
        (result.action === "updated"
          ? "✅ Movie/file mapping updated successfully."
          : "✅ Movie + file added successfully.") + updateText
      );

      setForm(current => ({
        ...current,
        tmdbId: "",
        messageId: "",
        size: ""
      }));

      await onSaved?.(result.movie);
    } catch (error) {
      setMessage("❌ " + (error.message || "Could not add the movie file."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="manual-movie-admin glass">
      <div className="manual-movie-head">
        <div>
          <span className="manual-movie-kicker">MANUAL FILE MODE</span>
          <h3>➕ Add Movie + File</h3>
          <p>
            File එක browser එකෙන් upload කරන්න ඕනේ නැහැ. මුලින් Movie Upload Channel එකට
            file එක upload කරලා, ඒ Telegram message ID එක මෙතන දාන්න.
          </p>
        </div>
        <span className="manual-movie-icon">📥</span>
      </div>

      <div className="manual-movie-form manual-movie-form-stack">
        <label>
          TMDB Movie ID / URL
          <input
            inputMode="numeric"
            placeholder="e.g. 27205"
            value={form.tmdbId}
            onChange={event => setField("tmdbId", event.target.value)}
          />
        </label>

        <div className="manual-movie-two">
          <label>
            Telegram File Message ID
            <input
              inputMode="numeric"
              placeholder="e.g. 1234"
              value={form.messageId}
              onChange={event => setField("messageId", event.target.value)}
            />
          </label>

          <label>
            Quality
            <select
              value={form.quality}
              onChange={event => setField("quality", event.target.value)}
            >
              {QUALITY.map(item => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>

        <label>
          Movie Upload Channel ID
          <input
            placeholder="e.g. -1001234567890 or @channelusername"
            value={form.sourceChatId}
            onChange={event => setField("sourceChatId", event.target.value)}
          />
          <small>මෙය file එක තියෙන Telegram channel එකයි.</small>
        </label>

        <label>
          File Size <span className="manual-optional">(optional)</span>
          <input
            placeholder="e.g. 3.8 GB"
            value={form.size}
            onChange={event => setField("size", event.target.value)}
          />
        </label>

        <button
          type="button"
          className="primary-btn manual-movie-add"
          disabled={busy}
          onClick={addMovieFile}
        >
          {busy ? "Saving…" : "🚀 Add Movie + File & Publish Update"}
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
            <small>
              ✓ {form.quality || "File"} mapped • Search ready
              {updateInfo?.published ? " • Update posted" : ""}
            </small>
          </div>
        </div>
      )}

      <div className="manual-movie-note">
        <b>Recommended workflow:</b> Telegram Upload Channel → upload file → copy message ID →
        enter TMDB ID + quality → add. This is much better for large files because the actual
        Telegram file is not re-uploaded through the Mini App.
      </div>
    </div>
  );
}
