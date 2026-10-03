import React, { useEffect, useState } from "react";
import "./manual-movie-admin.css";

const QUALITY = ["4K", "1080P", "720P", "480P"];

export default function ManualTvManager({ adminApi, media }) {
  const [form, setForm] = useState({
    scope: "episode",
    season: "1",
    episode: "1",
    quality: "1080P",
    channel_chat_id: "",
    channel_message_id: "",
    size: "",
    codec: "",
    audio: ""
  });
  const [entries, setEntries] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const setField = (key, value) => setForm(current => ({ ...current, [key]: value }));

  async function loadEntries() {
    if (!media?.id) return;
    try {
      const data = await adminApi("/admin/tv-downloads?mediaId=" + encodeURIComponent(media.id));
      setEntries(Array.isArray(data.entries) ? data.entries : []);
    } catch (error) {
      setMessage("❌ " + (error.message || "Could not load TV file mappings."));
    }
  }

  useEffect(() => {
    setMessage("");
    loadEntries();
  }, [media?.id]);

  async function saveEntry() {
    if (!media?.id) return;
    if (!form.season.trim()) return setMessage("Enter the season number.");
    if (form.scope === "episode" && !form.episode.trim()) return setMessage("Enter the episode number.");
    if (!form.channel_chat_id.trim()) return setMessage("Enter the TV channel Chat ID.");
    if (!form.channel_message_id.trim()) return setMessage("Enter the Telegram file message ID.");

    try {
      setBusy(true);
      setMessage("Saving TV file mapping…");
      await adminApi("/admin/tv-downloads", {
        method: "POST",
        body: JSON.stringify({
          mediaId: Number(media.id),
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
      setMessage("✅ " + label + " • " + form.quality + " saved.");
      setForm(current => ({ ...current, channel_message_id: "", size: "", codec: "", audio: "" }));
      await loadEntries();
    } catch (error) {
      setMessage("❌ " + (error.message || "Could not save TV file mapping."));
    } finally {
      setBusy(false);
    }
  }

  async function removeEntry(entry) {
    try {
      setBusy(true);
      await adminApi(
        "/admin/tv-downloads?mediaId=" + encodeURIComponent(media.id) +
        "&scope=" + encodeURIComponent(entry.scope) +
        "&season=" + entry.season +
        "&episode=" + (entry.episode || 0) +
        "&quality=" + encodeURIComponent(entry.quality),
        { method: "DELETE" }
      );
      setMessage("✅ " + entry.quality + " mapping removed.");
      await loadEntries();
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
          <h3>📺 Add TV Series File</h3>
          <p>
            Existing automatic TV workflow එකට කිසිම වෙනසක් නැහැ. මේක manual mappings සඳහා
            වෙනම storage/API එකක්. Episode හෝ Full Season දෙකම save කරන්න පුළුවන්.
          </p>
        </div>
        <span className="manual-movie-icon">📥</span>
      </div>

      <div className="manual-movie-form manual-movie-form-stack">
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
          TV Channel Chat ID
          <input
            placeholder="e.g. -1001234567890"
            value={form.channel_chat_id}
            onChange={event => setField("channel_chat_id", event.target.value)}
          />
          <small>File එක තියෙන private/public Telegram channel එක.</small>
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
          {busy ? "Saving…" : "🚀 Save TV File Mapping"}
        </button>
      </div>

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
        <b>Important:</b> Telegram file එක Mini App එකෙන් re-upload කරන්නේ නැහැ. Message ID එක save කරලා
        Telegram copyMessage delivery path එකෙන් userට file එක යවනවා.
      </div>
    </div>
  );
}
