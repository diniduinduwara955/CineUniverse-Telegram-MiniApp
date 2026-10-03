import React, { useEffect, useMemo, useState } from "react";
import "./manual-movie-admin.css";

const QUALITY = ["4K", "1080P", "720P", "480P"];

function parseTmdbTvId(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/(?:themoviedb\.org\/tv\/|^)(\d+)/i);
  const id = Number(match?.[1] || 0);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

export default function ManualTvManager({ adminApi, media, onSaved }) {
  const [tmdbInput, setTmdbInput] = useState(media?.id ? String(media.id) : "");
  const [selectedMedia, setSelectedMedia] = useState(media || null);
  const [form, setForm] = useState({
    scope: "episode", season: "1", episode: "1", quality: "1080P",
    channel_chat_id: "", channel_message_id: "", size: "", codec: "", audio: ""
  });
  const [entries, setEntries] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const setField = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const mediaId = Number(selectedMedia?.id || 0);
  const mediaLabel = useMemo(() => {
    if (!selectedMedia) return "";
    return selectedMedia.year ? `${selectedMedia.title} • ${selectedMedia.year}` : selectedMedia.title;
  }, [selectedMedia]);

  useEffect(() => {
    setTmdbInput(media?.id ? String(media.id) : "");
    setSelectedMedia(media || null);
    setMessage("");
  }, [media?.id]);

  useEffect(() => { loadEntries(); }, [mediaId]);

  async function loadEntries(id = mediaId) {
    if (!id) { setEntries([]); return; }
    try {
      const data = await adminApi("/admin/tv-downloads?mediaId=" + encodeURIComponent(id));
      setEntries(Array.isArray(data.entries) ? data.entries : []);
    } catch (error) {
      setMessage("❌ " + (error.message || "Could not load TV file mappings."));
    }
  }

  async function loadSeries() {
    const id = parseTmdbTvId(tmdbInput);
    if (!id) return setMessage("Enter a valid TMDB TV Series ID or TV URL.");
    try {
      setBusy(true);
      setMessage("Loading TV Series from TMDB…");
      const response = await fetch(window.location.origin + "/api/tv/" + id); const data = await response.json(); if (!response.ok) throw new Error(data?.error || ("API error " + response.status));
      setSelectedMedia(data);
      setTmdbInput(String(id));
      setMessage("✅ " + (data.title || "TV Series") + " loaded.");
    } catch (error) {
      setSelectedMedia(null);
      setEntries([]);
      setMessage("❌ " + (error.message || "Could not load the TV Series."));
    } finally { setBusy(false); }
  }

  async function saveEntry() {
    if (!mediaId) return setMessage("Load a TV Series first.");
    if (!form.season.trim()) return setMessage("Enter the season number.");
    if (form.scope === "episode" && !form.episode.trim()) return setMessage("Enter the episode number.");
    if (!form.channel_chat_id.trim()) return setMessage("Enter the TV channel Chat ID.");
    if (!form.channel_message_id.trim()) return setMessage("Enter the Telegram file message ID.");
    try {
      setBusy(true);
      setMessage("Saving TV file + publishing update…");
      const result = await adminApi("/admin/tv-downloads", {
        method: "POST",
        body: JSON.stringify({
          mediaId,
          scope: form.scope,
          season: Number(form.season),
          episode: form.scope === "episode" ? Number(form.episode) : 0,
          quality: form.quality,
          channel_chat_id: form.channel_chat_id.trim(),
          channel_message_id: Number(form.channel_message_id),
          size: form.size.trim(),
          codec: form.codec.trim(),
          audio: form.audio.trim()
        })
      });
      const label = form.scope === "season"
        ? "S" + String(form.season).padStart(2, "0") + " • Full Season"
        : "S" + String(form.season).padStart(2, "0") + "E" + String(form.episode).padStart(2, "0");
      const updateText = result.update?.published
        ? " • 📢 Update channel posted"
        : result.update?.error
          ? " • ⚠️ File saved, update channel failed"
          : "";
      setMessage("✅ " + label + " • " + form.quality + " saved." + updateText);
      setForm(current => ({ ...current, channel_message_id: "", size: "", codec: "", audio: "" }));
      await loadEntries(mediaId);
      await onSaved?.(result);
    } catch (error) {
      setMessage("❌ " + (error.message || "Could not save TV file mapping."));
    } finally { setBusy(false); }
  }

  async function removeEntry(entry) {
    try {
      setBusy(true);
      await adminApi(
        "/admin/tv-downloads?mediaId=" + encodeURIComponent(mediaId) +
        "&scope=" + encodeURIComponent(entry.scope) +
        "&season=" + entry.season +
        "&episode=" + (entry.episode || 0) +
        "&quality=" + encodeURIComponent(entry.quality),
        { method: "DELETE" }
      );
      setMessage("✅ " + entry.quality + " mapping removed.");
      await loadEntries(mediaId);
    } catch (error) {
      setMessage("❌ " + (error.message || "Could not remove mapping."));
    } finally { setBusy(false); }
  }

  return (
    <div className="manual-movie-admin glass">
      <div className="manual-movie-head">
        <div>
          <span className="manual-movie-kicker">MANUAL TV FILE MODE</span>
          <h3>📺 Add TV Series + File</h3>
          <p>
            Automatic TV detection workflow එක untouched. Auto detect නොවන files සඳහා
            TMDB TV ID/URL + Telegram message ID එක දාලා manually add කරන්න පුළුවන්.
          </p>
        </div>
        <span className="manual-movie-icon">📺</span>
      </div>

      {!selectedMedia && (
        <div className="manual-movie-form manual-movie-form-stack">
          <label>
            TMDB TV Series ID / URL
            <input inputMode="numeric" placeholder="e.g. 1399" value={tmdbInput}
              onChange={event => setTmdbInput(event.target.value)} />
          </label>
          <button type="button" className="primary-btn manual-movie-add" disabled={busy} onClick={loadSeries}>
            {busy ? "Loading…" : "🔎 Load TV Series"}
          </button>
        </div>
      )}

      {selectedMedia && (
        <>
          <div className="manual-movie-preview">
            {selectedMedia.poster
              ? <img src={selectedMedia.poster} alt="" loading="lazy" referrerPolicy="no-referrer" />
              : <div className="manual-movie-fallback">📺</div>}
            <div>
              <strong>{mediaLabel}</strong>
              <span>TV Series • TMDB {mediaId} • ⭐ {selectedMedia.rating || selectedMedia.tmdbRating || "—"}</span>
              <small>Manual files can be added without using the Admin search box.</small>
            </div>
          </div>

          <div className="manual-movie-form manual-movie-form-stack">
            <label>
              TMDB TV Series ID / URL
              <input inputMode="numeric" value={tmdbInput} onChange={event => setTmdbInput(event.target.value)} />
            </label>
            <button type="button" className="glass-btn" disabled={busy} onClick={loadSeries}>🔄 Change TV Series</button>

            <div className="manual-movie-two">
              <label>
                Mode
                <select value={form.scope} onChange={event => setField("scope", event.target.value)}>
                  <option value="episode">Episode</option>
                  <option value="season">Full Season</option>
                </select>
              </label>
              <label>
                Quality
                <select value={form.quality} onChange={event => setField("quality", event.target.value)}>
                  {QUALITY.map(item => <option key={item}>{item}</option>)}
                </select>
              </label>
            </div>

            <div className="manual-movie-two">
              <label>Season
                <input inputMode="numeric" placeholder="e.g. 2" value={form.season}
                  onChange={event => setField("season", event.target.value)} />
              </label>
              {form.scope === "episode" && (
                <label>Episode
                  <input inputMode="numeric" placeholder="e.g. 5" value={form.episode}
                    onChange={event => setField("episode", event.target.value)} />
                </label>
              )}
            </div>

            <label>TV Channel Chat ID
              <input placeholder="e.g. -1001234567890" value={form.channel_chat_id}
                onChange={event => setField("channel_chat_id", event.target.value)} />
              <small>File එක තියෙන private/public Telegram channel එක.</small>
            </label>

            <label>Telegram File Message ID
              <input inputMode="numeric" placeholder="e.g. 4567" value={form.channel_message_id}
                onChange={event => setField("channel_message_id", event.target.value)} />
            </label>

            <div className="manual-movie-two">
              <label>File Size
                <input placeholder="e.g. 1.4 GB" value={form.size}
                  onChange={event => setField("size", event.target.value)} />
              </label>
              <label>Codec
                <input placeholder="e.g. HEVC" value={form.codec}
                  onChange={event => setField("codec", event.target.value)} />
              </label>
            </div>

            <label>Audio
              <input placeholder="e.g. English 5.1" value={form.audio}
                onChange={event => setField("audio", event.target.value)} />
            </label>

            <button type="button" className="primary-btn manual-movie-add" disabled={busy} onClick={saveEntry}>
              {busy ? "Saving…" : "🚀 Add TV File & Publish Update"}
            </button>
          </div>
        </>
      )}

      {message && <div className="manual-movie-message">{message}</div>}
      {entries.length > 0 && (
        <div className="quality-manager" style={{ marginTop: 12 }}>
          {entries.map(entry => (
            <div className="quality-manager-row blue" key={entry.key}>
              <div>
                <strong>
                  {entry.scope === "season"
                    ? "S" + String(entry.season).padStart(2, "0") + " • Full Season"
                    : "S" + String(entry.season).padStart(2, "0") + "E" + String(entry.episode).padStart(2, "0")}
                </strong>
                <small>{entry.quality}{entry.size ? " • " + entry.size : ""}{entry.codec ? " • " + entry.codec : ""}{entry.audio ? " • " + entry.audio : ""}</small>
              </div>
              <button className="danger-btn" disabled={busy} onClick={() => removeEntry(entry)}>Remove</button>
            </div>
          ))}
        </div>
      )}

      <div className="manual-movie-note">
        <b>Important:</b> Telegram file එක Mini App එකෙන් re-upload කරන්නේ නැහැ. Message ID එක save කරලා
        Telegram copyMessage delivery path එකෙන් userට file එක යවනවා.
      </div>
    </div>
  );
}
