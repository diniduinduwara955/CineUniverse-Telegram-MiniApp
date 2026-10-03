import React, { useEffect, useMemo, useState } from "react";
import "./manual-movie-admin.css";

const QUALITY = ["4K", "1080P", "720P", "480P"];

export default function ManualTvManager({ adminApi, media, onSaved }) {
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState(media || null);
  const [privateChannelUrl, setPrivateChannelUrl] = useState("");
  const [privateChannelBusy, setPrivateChannelBusy] = useState(false);

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
    setSelectedMedia(media || null);
    setMessage("");
  }, [media?.id]);

  useEffect(() => {
    loadEntries();
    loadPrivateChannel();
  }, [mediaId]);

  async function publicApi(path) {
    const response = await fetch(window.location.origin + "/api" + path);
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch {
      throw new Error("Invalid server response.");
    }
    if (!response.ok) throw new Error(data?.error || ("API error " + response.status));
    return data;
  }

  async function adminApiSameOrigin(path, options = {}) {
    const response = await fetch(window.location.origin + "/api" + path, {
      ...options,
      headers: {
        "content-type": "application/json",
        "x-admin-key": sessionStorage.getItem("cine-admin-key") || "",
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch {
      throw new Error("Invalid server response.");
    }
    if (!response.ok) throw new Error(data?.error || ("Admin API error " + response.status));
    return data;
  }

  async function searchTvSeries() {
    const q = search.trim();
    if (!q) {
      setSearchResults([]);
      return setMessage("Enter a TV Series name first.");
    }
    try {
      setSearchBusy(true);
      setMessage("Searching TV Series…");
      const data = await publicApi("/tmdb-search?q=" + encodeURIComponent(q));
      const tv = (Array.isArray(data.results) ? data.results : [])
        .filter(item => item?.mediaType === "tv" || item?.type === "TV Series");
      setSearchResults(tv);
      setMessage(tv.length ? `${tv.length} TV Series found.` : "No TV Series found.");
    } catch (error) {
      setSearchResults([]);
      setMessage("❌ " + (error.message || "TV search failed."));
    } finally {
      setSearchBusy(false);
    }
  }

  async function selectSeries(item) {
    try {
      setBusy(true);
      setMessage("Loading TV Series details…");
      const data = await publicApi("/tv/" + item.id);
      setSelectedMedia(data);
      setSearchResults([]);
      setSearch(item.title || "");
      setMessage("✅ " + (data.title || "TV Series") + " selected.");
    } catch (error) {
      setMessage("❌ " + (error.message || "Could not load the TV Series."));
    } finally {
      setBusy(false);
    }
  }

  async function loadPrivateChannel(id = mediaId) {
    if (!id) {
      setPrivateChannelUrl("");
      return;
    }
    try {
      const data = await adminApiSameOrigin("/admin/tv-channel?mediaId=" + encodeURIComponent(id));
      setPrivateChannelUrl(data.inviteUrl || "");
    } catch {
      setPrivateChannelUrl("");
    }
  }

  async function savePrivateChannel() {
    if (!mediaId) return setMessage("Select a TV Series first.");
    const link = privateChannelUrl.trim();
    if (!link) return setMessage("Enter the private Telegram channel link first.");
    if (!/^https:\/\/t\.me\//i.test(link)) {
      return setMessage("Use a Telegram link such as https://t.me/+XXXXXXXX");
    }

    try {
      setPrivateChannelBusy(true);
      setMessage("Saving private TV channel…");
      const result = await adminApiSameOrigin("/admin/tv-channel", {
        method: "POST",
        body: JSON.stringify({ mediaId, inviteUrl: link })
      });
      setPrivateChannelUrl(result.inviteUrl || link);
      setMessage(
        result.published
          ? "✅ Private TV channel saved • Update channel posted."
          : "✅ Private TV channel saved • Update channel post could not be sent now."
      );
      await onSaved?.(result);
    } catch (error) {
      setMessage("❌ " + (error.message || "Could not save private TV channel."));
    } finally {
      setPrivateChannelBusy(false);
    }
  }

  async function saveEntry() {
    if (!mediaId) return setMessage("Select a TV Series first.");
    if (!form.season.trim()) return setMessage("Enter the season number.");
    if (form.scope === "episode" && !form.episode.trim()) return setMessage("Enter the episode number.");
    if (!form.channel_chat_id.trim()) return setMessage("Enter the TV channel Chat ID.");
    if (!form.channel_message_id.trim()) return setMessage("Enter the Telegram file message ID.");

    try {
      setBusy(true);
      setMessage("Saving TV file + publishing update…");
      const result = await adminApiSameOrigin("/admin/tv-downloads", {
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
    } finally {
      setBusy(false);
    }
  }

  async function loadEntries(id = mediaId) {
    if (!id) {
      setEntries([]);
      return;
    }
    try {
      const data = await adminApiSameOrigin("/admin/tv-downloads?mediaId=" + encodeURIComponent(id));
      setEntries(Array.isArray(data.entries) ? data.entries : []);
    } catch (error) {
      setMessage("❌ " + (error.message || "Could not load TV file mappings."));
    }
  }

  async function removeEntry(entry) {
    try {
      setBusy(true);
      await adminApiSameOrigin(
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
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="manual-movie-admin glass">
      <div className="manual-movie-head">
        <div>
          <span className="manual-movie-kicker">MANUAL TV FILE MODE</span>
          <h3>📺 Add TV Series</h3>
          <p>
            TV Series එක search කරලා select කරන්න. ඊට පස්සේ ඒ series එකට private Telegram
            channel එකත්, episode/full-season filesත් වෙන වෙනම add කරන්න පුළුවන්.
          </p>
        </div>
        <span className="manual-movie-icon">📺</span>
      </div>

      <div className="manual-movie-form manual-movie-form-stack">
        <label>
          🔎 Search TV Series
          <input
            placeholder="e.g. Game of Thrones"
            value={search}
            onChange={event => setSearch(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter") searchTvSeries();
            }}
          />
        </label>
        <button type="button" className="primary-btn manual-movie-add" disabled={searchBusy} onClick={searchTvSeries}>
          {searchBusy ? "Searching…" : "🔎 Search TV Series"}
        </button>
      </div>

      {searchResults.length > 0 && (
        <div className="quality-manager" style={{ marginTop: 12 }}>
          {searchResults.map(item => (
            <button
              key={`tv-search-${item.id}`}
              type="button"
              className="quality-manager-row blue"
              style={{ width: "100%", textAlign: "left", cursor: "pointer", border: "0" }}
              onClick={() => selectSeries(item)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {item.poster && (
                  <img
                    src={item.poster}
                    alt=""
                    style={{ width: 46, height: 64, objectFit: "cover", borderRadius: 8 }}
                    loading="lazy"
                  />
                )}
                <div>
                  <strong>{item.title}</strong>
                  <small>TV Series • {item.year} • ⭐ {item.rating} • TMDB {item.id}</small>
                </div>
              </div>
              <span>›</span>
            </button>
          ))}
        </div>
      )}

      {selectedMedia && (
        <>
          <div className="manual-movie-preview" style={{ marginTop: 14 }}>
            {selectedMedia.poster
              ? <img src={selectedMedia.poster} alt="" loading="lazy" referrerPolicy="no-referrer" />
              : <div className="manual-movie-fallback">📺</div>}
            <div>
              <strong>{mediaLabel}</strong>
              <span>TV Series • TMDB {mediaId} • ⭐ {selectedMedia.rating || selectedMedia.tmdbRating || "—"}</span>
              <small>Selected TV Series එකට private channel + files add කරන්න.</small>
            </div>
          </div>

          <div className="manual-movie-form manual-movie-form-stack" style={{ marginTop: 12 }}>
            <label>
              📺 Private Telegram TV Channel
              <input
                type="url"
                placeholder="https://t.me/+XXXXXXXXXXXX"
                value={privateChannelUrl}
                onChange={event => setPrivateChannelUrl(event.target.value)}
              />
              <small>මේ series එකට dedicated private Telegram channel link එක.</small>
            </label>

            <button
              type="button"
              className="primary-btn manual-movie-add"
              disabled={privateChannelBusy}
              onClick={savePrivateChannel}
            >
              {privateChannelBusy ? "Saving…" : "📺 Save Private TV Channel"}
            </button>
          </div>

          <div className="manual-movie-form manual-movie-form-stack" style={{ marginTop: 12 }}>
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
              <label>
                Season
                <input
                  inputMode="numeric"
                  placeholder="e.g. 2"
                  value={form.season}
                  onChange={event => setField("season", event.target.value)}
                />
              </label>
              {form.scope === "episode" && (
                <label>
                  Episode
                  <input
                    inputMode="numeric"
                    placeholder="e.g. 5"
                    value={form.episode}
                    onChange={event => setField("episode", event.target.value)}
                  />
                </label>
              )}
            </div>

            <label>
              TV File Channel Chat ID
              <input
                placeholder="e.g. -1001234567890"
                value={form.channel_chat_id}
                onChange={event => setField("channel_chat_id", event.target.value)}
              />
              <small>File එක තියෙන Telegram channel එක.</small>
            </label>

            <label>
              Telegram File Message ID
              <input
                inputMode="numeric"
                placeholder="e.g. 4567"
                value={form.channel_message_id}
                onChange={event => setField("channel_message_id", event.target.value)}
              />
            </label>

            <div className="manual-movie-two">
              <label>
                File Size
                <input placeholder="e.g. 1.4 GB" value={form.size} onChange={event => setField("size", event.target.value)} />
              </label>
              <label>
                Codec
                <input placeholder="e.g. HEVC" value={form.codec} onChange={event => setField("codec", event.target.value)} />
              </label>
            </div>

            <label>
              Audio
              <input placeholder="e.g. English 5.1" value={form.audio} onChange={event => setField("audio", event.target.value)} />
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
                <small>
                  {entry.quality}
                  {entry.size ? " • " + entry.size : ""}
                  {entry.codec ? " • " + entry.codec : ""}
                  {entry.audio ? " • " + entry.audio : ""}
                </small>
              </div>
              <button className="danger-btn" disabled={busy} onClick={() => removeEntry(entry)}>Remove</button>
            </div>
          ))}
        </div>
      )}

      <div className="manual-movie-note">
        <b>Important:</b> TV Series search → select → private channel save → episode/full-season file mapping.
        Automatic TV detection workflow එක වෙනස් කරලා නැහැ.
      </div>
    </div>
  );
}
