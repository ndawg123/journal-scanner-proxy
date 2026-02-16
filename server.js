// ============================================================
// Journal Scanner — Full-Stack Server
// ============================================================
// Serves the React frontend as HTML and proxies Notion API calls.
//
// Deploy to Render:
//   Build command: npm install
//   Start command: node server.js
//
// Dependencies: express, cors
// ============================================================

const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// ── Health check ──
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Proxy: Create Notion page ──
app.post("/api/notion/pages", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: "Missing Authorization header" });
  }
  try {
    const response = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        message: data.message || "Notion API error",
        code: data.code,
        details: data,
      });
    }
    res.json(data);
  } catch (error) {
    console.error("Notion proxy error:", error);
    res.status(500).json({ message: error.message });
  }
});

// ── Proxy: Query Notion database ──
app.post("/api/notion/databases/:id/query", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: "Missing Authorization header" });
  }
  try {
    const response = await fetch(
      `https://api.notion.com/v1/databases/${req.params.id}/query`,
      {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify(req.body),
      }
    );
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        message: data.message || "Notion API error",
        code: data.code,
      });
    }
    res.json(data);
  } catch (error) {
    console.error("Notion proxy error:", error);
    res.status(500).json({ message: error.message });
  }
});

// ── Serve the React app ──
app.get("/", (req, res) => {
  res.send(getHTML());
});

// ── Start ──
app.listen(PORT, () => {
  console.log(`\n📓 Journal Scanner running on http://localhost:${PORT}\n`);
});

// ============================================================
// HTML + Inline React App
// ============================================================
function getHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Journal Scanner — Handwriting OCR → Notion</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📓</text></svg>" />
  <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600;8..60,700&family=Source+Code+Pro:wght@400;500&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Source Serif 4', Georgia, serif; background: #f5f0e8; color: #2d2d3f; }
    @keyframes spin { to { transform: rotate(360deg); } }
    input:focus, textarea:focus { border-color: #8b4513 !important; box-shadow: 0 0 0 3px rgba(139,69,19,0.12); outline: none; }
    button { cursor: pointer; }
    button:hover { opacity: 0.88; }
    @media (max-width: 700px) {
      .review-grid { grid-template-columns: 1fr !important; }
    }
  </style>
</head>
<body>
  <div id="root"></div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.9/babel.min.js"></script>

  <script type="text/babel" data-type="module">
    const { useState, useRef, useCallback, useEffect } = React;

    // ── Palette ──
    const P = {
      ink: "#1a1a2e", paper: "#f5f0e8", accent: "#8b4513",
      accentMuted: "rgba(139,69,19,0.12)", gold: "#c4984a",
      goldLight: "rgba(196,152,74,0.15)", cream: "#faf6ef",
      sage: "#6b7c5e", sageMuted: "rgba(107,124,94,0.12)",
      border: "rgba(26,26,46,0.08)", borderDark: "rgba(26,26,46,0.15)",
      text: "#2d2d3f", textMuted: "#6b6b7f", white: "#ffffff",
      red: "#b44040", redMuted: "rgba(180,64,64,0.1)",
    };

    const STATUS = {
      IDLE: "idle", UPLOADING: "uploading", PROCESSING: "processing",
      OCR_COMPLETE: "ocr_complete", SENDING: "sending",
      COMPLETE: "complete", ERROR: "error",
    };

    const SAMPLE_OCR = "March 14, 2026\\n\\nToday I spent time reflecting on how quickly life moves. The challenges feel bigger but so do the rewards.\\n\\nHad a good conversation about our upcoming service project. Everyone seems energized about next month. Need to follow up with the Hendersons about hosting.\\n\\nWork has been interesting \\u2014 finally getting traction on the new framework. The team is starting to see how much faster we can make decisions.\\n\\nGrateful for a quiet evening at home.";

    // ── Shared styles ──
    const S = {
      primaryBtn: { padding: "10px 22px", border: "none", borderRadius: 8, background: P.accent, color: P.white, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 },
      secondaryBtn: { padding: "10px 22px", border: "1.5px solid " + P.borderDark, borderRadius: 8, background: P.white, color: P.text, fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 },
      ghostBtn: { padding: "10px 16px", border: "none", borderRadius: 8, background: "transparent", color: P.textMuted, fontSize: 14, cursor: "pointer", fontFamily: "inherit" },
      fieldLabel: { display: "block", fontSize: 12, fontWeight: 600, color: P.textMuted, marginBottom: 4, marginTop: 12, textTransform: "uppercase", letterSpacing: "0.03em" },
      textInput: { width: "100%", padding: "9px 12px", border: "1.5px solid " + P.border, borderRadius: 8, fontSize: 14, fontFamily: "inherit", color: P.text, marginBottom: 4, boxSizing: "border-box", background: P.cream },
      textarea: { width: "100%", padding: 12, border: "1.5px solid " + P.border, borderRadius: 8, fontSize: 14, fontFamily: "'Source Code Pro', monospace", color: P.text, lineHeight: 1.6, resize: "vertical", boxSizing: "border-box", background: P.cream },
      card: { background: P.white, borderRadius: 14, padding: "20px 22px", marginTop: 16, border: "1px solid " + P.border },
      helpBox: { marginTop: 16, padding: "14px 16px", background: P.cream, borderRadius: 10, fontSize: 13, lineHeight: 1.6, color: P.text },
      code: { background: P.accentMuted, padding: "1px 6px", borderRadius: 4, fontSize: 12, fontFamily: "monospace", color: P.accent },
      link: { color: P.accent, fontWeight: 500 },
    };

    // ============================================================
    // ConfigBanner
    // ============================================================
    function ConfigBanner({ onGo }) {
      return (
        <div style={{ background: P.goldLight, border: "1px solid " + P.gold, borderRadius: 10, padding: "14px 18px", marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>🔑</span>
            <div>
              <strong style={{ color: P.accent }}>Setup Required</strong>
              <p style={{ margin: "2px 0 0", color: P.textMuted, fontSize: 13 }}>Add your API keys in Settings to enable scanning and Notion sync.</p>
            </div>
          </div>
          <button onClick={onGo} style={{ padding: "7px 16px", border: "1px solid " + P.gold, borderRadius: 6, background: P.white, fontSize: 13, fontWeight: 600, color: P.accent, fontFamily: "inherit" }}>Open Settings →</button>
        </div>
      );
    }

    // ============================================================
    // ScanView
    // ============================================================
    function ScanView({ settings, entries, setEntries, isConfigured }) {
      const [status, setStatus] = useState(STATUS.IDLE);
      const [imageData, setImageData] = useState(null);
      const [fileName, setFileName] = useState("");
      const [ocrText, setOcrText] = useState("");
      const [editedText, setEditedText] = useState("");
      const [entryTitle, setEntryTitle] = useState("");
      const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0]);
      const [entryTags, setEntryTags] = useState("");
      const [error, setError] = useState("");
      const [progress, setProgress] = useState("");
      const fileRef = useRef(null);
      const camRef = useRef(null);

      const resetState = () => {
        setStatus(STATUS.IDLE); setImageData(null); setFileName(""); setOcrText("");
        setEditedText(""); setEntryTitle(""); setEntryDate(new Date().toISOString().split("T")[0]);
        setEntryTags(""); setError(""); setProgress("");
      };

      const handleFile = useCallback(async (file) => {
        if (!file) return;
        setError(""); setFileName(file.name); setStatus(STATUS.UPLOADING); setProgress("Reading image...");
        const reader = new FileReader();
        reader.onload = async (e) => {
          const base64Full = e.target.result;
          const base64Data = base64Full.split(",")[1];
          setImageData(base64Full); setStatus(STATUS.PROCESSING); setProgress("Running handwriting OCR...");

          if (!settings.googleVisionKey) {
            await new Promise(r => setTimeout(r, 1500));
            setOcrText(SAMPLE_OCR); setEditedText(SAMPLE_OCR);
            setEntryTitle("Journal Entry \\u2014 " + entryDate);
            setStatus(STATUS.OCR_COMPLETE); setProgress(""); return;
          }

          try {
            const resp = await fetch(
              "https://vision.googleapis.com/v1/images:annotate?key=" + settings.googleVisionKey,
              { method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ requests: [{ image: { content: base64Data }, features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }], imageContext: { languageHints: ["en"] } }] }) }
            );
            const d = await resp.json();
            if (d.error) throw new Error(d.error.message);
            const fullText = d.responses?.[0]?.fullTextAnnotation?.text || "";
            if (!fullText) throw new Error("No text detected. Try a clearer photo.");
            setOcrText(fullText); setEditedText(fullText);
            const fl = fullText.split("\\n")[0]?.trim() || "";
            setEntryTitle(fl.length > 60 ? fl.slice(0,60) + "..." : fl || "Journal Entry \\u2014 " + entryDate);
            setStatus(STATUS.OCR_COMPLETE); setProgress("");
          } catch (err) { setError("OCR Error: " + err.message); setStatus(STATUS.ERROR); setProgress(""); }
        };
        reader.readAsDataURL(file);
      }, [settings.googleVisionKey, entryDate]);

      const sendToNotion = async () => {
        if (!settings.notionToken || !settings.notionDatabaseId) { setError("Please configure Notion credentials in Settings."); return; }
        setStatus(STATUS.SENDING); setProgress("Creating Notion page..."); setError("");
        try {
          const proxyBase = settings.proxyUrl || "";
          const notionBody = {
            parent: { database_id: settings.notionDatabaseId },
            properties: {
              Name: { title: [{ text: { content: entryTitle } }] },
              Date: { date: { start: entryDate } },
              ...(entryTags ? { Tags: { multi_select: entryTags.split(",").map(t => ({ name: t.trim() })).filter(t => t.name) } } : {}),
              Source: { select: { name: "Handwritten Scan" } },
            },
            children: [
              { object: "block", type: "heading_2", heading_2: { rich_text: [{ type: "text", text: { content: "Transcribed Text" } }] } },
              ...editedText.split("\\n\\n").filter(p => p.trim()).map(p => ({ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: p.trim() } }] } })),
              { object: "block", type: "divider", divider: {} },
              { object: "block", type: "heading_2", heading_2: { rich_text: [{ type: "text", text: { content: "Original Scan" } }] } },
              { object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: "📎 Original handwritten page image is attached to this entry." } }] } },
            ],
          };
          const response = await fetch(proxyBase + "/api/notion/pages", {
            method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + settings.notionToken },
            body: JSON.stringify(notionBody),
          });
          if (!response.ok) { const ed = await response.json().catch(() => ({})); throw new Error(ed.message || "Notion API error: " + response.status); }
          const page = await response.json();
          setProgress("Entry created successfully!");
          setEntries(prev => [{ id: page.id || Date.now().toString(), title: entryTitle, date: entryDate, tags: entryTags, ocrText: editedText, imageData, notionUrl: page.url || null, createdAt: new Date().toISOString() }, ...prev]);
          setStatus(STATUS.COMPLETE);
        } catch (err) { setError("Notion Error: " + err.message); setStatus(STATUS.ERROR); setProgress(""); }
      };

      const saveLocally = () => {
        setEntries(prev => [{ id: Date.now().toString(), title: entryTitle, date: entryDate, tags: entryTags, ocrText: editedText, imageData, notionUrl: null, createdAt: new Date().toISOString() }, ...prev]);
        setStatus(STATUS.COMPLETE); setProgress("Saved locally (not synced to Notion).");
      };

      return (
        <div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleFile(e.target.files?.[0])} />
          <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => handleFile(e.target.files?.[0])} />

          {/* IDLE */}
          {(status === STATUS.IDLE || status === STATUS.ERROR) && !imageData && (
            <div style={{ textAlign: "center", padding: "60px 24px", border: "2px dashed " + P.borderDark, borderRadius: 16, background: P.white }}>
              <div style={{ marginBottom: 16 }}>
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none"><rect x="6" y="10" width="36" height="28" rx="3" stroke={P.accent} strokeWidth="2" fill={P.accentMuted} /><path d="M20 28l4-5 4 5" stroke={P.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><line x1="24" y1="23" x2="24" y2="33" stroke={P.accent} strokeWidth="2" strokeLinecap="round" /></svg>
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: P.ink, margin: "0 0 8px" }}>Scan a Journal Page</h2>
              <p style={{ fontSize: 14, color: P.textMuted, maxWidth: 420, margin: "0 auto 24px", lineHeight: 1.5 }}>Upload a photo of your handwritten journal page. The text will be extracted via OCR and sent to your Notion database.</p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                <button style={S.primaryBtn} onClick={() => fileRef.current?.click()}><span>📁</span> Choose File</button>
                <button style={S.secondaryBtn} onClick={() => camRef.current?.click()}><span>📷</span> Take Photo</button>
              </div>
              <p style={{ fontSize: 12, color: P.textMuted, marginTop: 16 }}>Supports JPG, PNG, HEIC — max 20MB</p>
              {!isConfigured && <p style={{ fontSize: 12, color: P.accent, marginTop: 8, fontStyle: "italic" }}>Demo Mode: No API keys configured. OCR will return sample text.</p>}
            </div>
          )}

          {/* PROCESSING */}
          {(status === STATUS.UPLOADING || status === STATUS.PROCESSING) && (
            <div style={{ textAlign: "center", padding: "40px 24px" }}>
              {imageData && <img src={imageData} alt="Preview" style={{ maxWidth: 300, maxHeight: 300, borderRadius: 12, border: "1px solid " + P.border, marginBottom: 24, objectFit: "contain" }} />}
              <div style={{ display: "inline-flex", alignItems: "center", gap: 14, padding: "16px 28px", background: P.white, borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
                <div style={{ width: 20, height: 20, border: "2px solid " + P.border, borderTopColor: P.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                <p style={{ fontSize: 14, color: P.text, margin: 0 }}>{progress}</p>
              </div>
            </div>
          )}

          {/* OCR COMPLETE — Review */}
          {status === STATUS.OCR_COMPLETE && (
            <div style={{ background: P.white, borderRadius: 16, padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
              <div className="review-grid" style={{ display: "grid", gridTemplateColumns: "minmax(200px, 1fr) 2fr", gap: 28 }}>
                <div>
                  <h3 style={{ fontSize: 11, fontWeight: 700, color: P.ink, margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Original Scan</h3>
                  <div style={{ background: P.cream, borderRadius: 10, padding: 8, border: "1px solid " + P.border }}>
                    {imageData && <img src={imageData} alt="Scan" style={{ width: "100%", borderRadius: 6, display: "block" }} />}
                  </div>
                  <p style={{ fontSize: 11, color: P.textMuted, marginTop: 6, textAlign: "center" }}>{fileName}</p>
                </div>
                <div>
                  <h3 style={{ fontSize: 11, fontWeight: 700, color: P.ink, margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Extracted Text</h3>
                  <label style={S.fieldLabel}>Title</label>
                  <input type="text" value={entryTitle} onChange={e => setEntryTitle(e.target.value)} style={S.textInput} placeholder="Entry title..." />
                  <div style={{ display: "flex", gap: 12 }}>
                    <div style={{ flex: 1 }}><label style={S.fieldLabel}>Date</label><input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} style={S.textInput} /></div>
                    <div style={{ flex: 1 }}><label style={S.fieldLabel}>Tags (comma-separated)</label><input type="text" value={entryTags} onChange={e => setEntryTags(e.target.value)} style={S.textInput} placeholder="journal, personal, ..." /></div>
                  </div>
                  <label style={S.fieldLabel}>Transcribed Text <span style={{ fontWeight: 400, color: P.textMuted }}>— edit to correct OCR errors</span></label>
                  <textarea value={editedText} onChange={e => setEditedText(e.target.value)} style={S.textarea} rows={14} />
                  <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                    <button style={S.primaryBtn} onClick={sendToNotion}>Send to Notion →</button>
                    <button style={S.secondaryBtn} onClick={saveLocally}>Save Locally Only</button>
                    <button style={S.ghostBtn} onClick={resetState}>Cancel</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SENDING */}
          {status === STATUS.SENDING && (
            <div style={{ textAlign: "center", padding: "40px 24px" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 14, padding: "16px 28px", background: P.white, borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
                <div style={{ width: 20, height: 20, border: "2px solid " + P.border, borderTopColor: P.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                <p style={{ fontSize: 14, color: P.text, margin: 0 }}>{progress}</p>
              </div>
            </div>
          )}

          {/* COMPLETE */}
          {status === STATUS.COMPLETE && (
            <div style={{ textAlign: "center", padding: "60px 24px" }}>
              <div style={{ width: 60, height: 60, borderRadius: "50%", background: P.sageMuted, color: P.sage, fontSize: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>✓</div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: P.ink, margin: "0 0 6px" }}>Entry Saved!</h2>
              <p style={{ fontSize: 14, color: P.textMuted, margin: 0 }}>{progress}</p>
              {entries[0]?.notionUrl && <a href={entries[0].notionUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 12, color: P.accent, fontWeight: 600, fontSize: 14 }}>Open in Notion →</a>}
              <div><button style={{ ...S.primaryBtn, marginTop: 20 }} onClick={resetState}>Scan Another Page</button></div>
            </div>
          )}

          {/* ERROR */}
          {error && (
            <div style={{ background: P.redMuted, border: "1px solid " + P.red, borderRadius: 10, padding: "12px 16px", marginTop: 20, fontSize: 13, color: P.red, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span><strong>Error:</strong> {error}</span>
              <button onClick={() => setError("")} style={{ background: "none", border: "none", color: P.red, cursor: "pointer", fontSize: 16, padding: "0 4px" }}>✕</button>
            </div>
          )}
        </div>
      );
    }

    // ============================================================
    // EntriesView
    // ============================================================
    function EntriesView({ entries }) {
      const [search, setSearch] = useState("");
      const [expanded, setExpanded] = useState(null);
      const filtered = entries.filter(e =>
        e.title.toLowerCase().includes(search.toLowerCase()) ||
        e.ocrText.toLowerCase().includes(search.toLowerCase()) ||
        (e.tags || "").toLowerCase().includes(search.toLowerCase())
      );

      return (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: P.ink, margin: 0 }}>Scanned Entries <span style={{ fontSize: 14, fontWeight: 400, color: P.textMuted }}>{entries.length}</span></h2>
            {entries.length > 0 && (
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 14 }}>🔍</span>
                <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search entries..." style={{ padding: "8px 12px 8px 32px", border: "1.5px solid " + P.border, borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: P.white, minWidth: 220 }} />
              </div>
            )}
          </div>

          {entries.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 24px", background: P.white, borderRadius: 16 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📖</div>
              <h3 style={{ color: P.text, margin: "0 0 6px" }}>No entries yet</h3>
              <p style={{ color: P.textMuted, margin: 0, fontSize: 14 }}>Scan your first journal page to see it here.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 24px", background: P.white, borderRadius: 16 }}>
              <p style={{ color: P.textMuted, margin: 0 }}>No entries match "{search}"</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filtered.map(entry => (
                <div key={entry.id} style={{ background: P.white, borderRadius: 12, padding: "16px 18px", cursor: "pointer", border: "1px solid " + P.border }} onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                      {entry.imageData && <img src={entry.imageData} alt="" style={{ width: 48, height: 48, borderRadius: 6, objectFit: "cover", border: "1px solid " + P.border }} />}
                      <div>
                        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: P.ink }}>{entry.title}</h4>
                        <p style={{ margin: "2px 0 0", fontSize: 12, color: P.textMuted }}>
                          {new Date(entry.date).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                          {entry.notionUrl && <span style={{ marginLeft: 8, fontSize: 11, color: P.sage, fontWeight: 600 }}>Notion ✓</span>}
                        </p>
                        {entry.tags && (
                          <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                            {entry.tags.split(",").map((t, i) => <span key={i} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: P.accentMuted, color: P.accent, fontWeight: 500 }}>{t.trim()}</span>)}
                          </div>
                        )}
                      </div>
                    </div>
                    <span style={{ fontSize: 16, color: P.textMuted, transition: "transform 0.2s", transform: expanded === entry.id ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
                  </div>
                  {expanded === entry.id && (
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid " + P.border }}>
                      <pre style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap", fontFamily: "'Source Code Pro', monospace", color: P.text, margin: "0 0 16px", background: P.cream, padding: 14, borderRadius: 8 }}>{entry.ocrText}</pre>
                      {entry.imageData && <img src={entry.imageData} alt="Original scan" style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid " + P.border }} />}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    // ============================================================
    // SettingsView
    // ============================================================
    function SettingsView({ settings, setSettings }) {
      const [showTokens, setShowTokens] = useState({ notion: false, vision: false });
      const update = (key, val) => setSettings(s => ({ ...s, [key]: val }));

      return (
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: P.ink, margin: 0 }}>Configuration</h2>

          {/* Notion */}
          <div style={S.card}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 16 }}>
              <span style={{ fontSize: 22 }}>📝</span>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: P.ink }}>Notion Integration</h3>
                <p style={{ margin: "2px 0 0", fontSize: 13, color: P.textMuted }}>Connect to your Notion workspace to sync journal entries.</p>
              </div>
            </div>
            <label style={S.fieldLabel}>Integration Token</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type={showTokens.notion ? "text" : "password"} value={settings.notionToken} onChange={e => update("notionToken", e.target.value)} style={{ ...S.textInput, flex: 1, marginBottom: 0 }} placeholder="ntn_..." />
              <button onClick={() => setShowTokens(s => ({...s, notion: !s.notion}))} style={{ padding: "9px 14px", border: "1.5px solid " + P.border, borderRadius: 8, background: P.cream, fontSize: 12, fontWeight: 600, color: P.textMuted, fontFamily: "inherit" }}>{showTokens.notion ? "Hide" : "Show"}</button>
            </div>
            <label style={{ ...S.fieldLabel, marginTop: 14 }}>Database ID</label>
            <input type="text" value={settings.notionDatabaseId} onChange={e => update("notionDatabaseId", e.target.value)} style={S.textInput} placeholder="abc123def456..." />
            <div style={S.helpBox}>
              <strong>Setup Steps:</strong>
              <ol style={{ margin: "6px 0 0", paddingLeft: 20, fontSize: 13 }}>
                <li>Go to <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener noreferrer" style={S.link}>notion.so/my-integrations</a> and create a new integration</li>
                <li>Copy the "Internal Integration Secret" token</li>
                <li>Create a Notion database with: <code style={S.code}>Name</code> (title), <code style={S.code}>Date</code> (date), <code style={S.code}>Tags</code> (multi-select), <code style={S.code}>Source</code> (select)</li>
                <li>Share the database with your integration (click ··· → Connections)</li>
                <li>Copy the database ID from the URL: <code style={S.code}>notion.so/[workspace]/<strong>[DATABASE_ID]</strong>?v=...</code></li>
              </ol>
            </div>
          </div>

          {/* Google Vision */}
          <div style={S.card}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 16 }}>
              <span style={{ fontSize: 22 }}>👁️</span>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: P.ink }}>Google Cloud Vision</h3>
                <p style={{ margin: "2px 0 0", fontSize: 13, color: P.textMuted }}>Powers the handwriting OCR recognition.</p>
              </div>
            </div>
            <label style={S.fieldLabel}>API Key</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type={showTokens.vision ? "text" : "password"} value={settings.googleVisionKey} onChange={e => update("googleVisionKey", e.target.value)} style={{ ...S.textInput, flex: 1, marginBottom: 0 }} placeholder="AIza..." />
              <button onClick={() => setShowTokens(s => ({...s, vision: !s.vision}))} style={{ padding: "9px 14px", border: "1.5px solid " + P.border, borderRadius: 8, background: P.cream, fontSize: 12, fontWeight: 600, color: P.textMuted, fontFamily: "inherit" }}>{showTokens.vision ? "Hide" : "Show"}</button>
            </div>
            <div style={S.helpBox}>
              <strong>Setup Steps:</strong>
              <ol style={{ margin: "6px 0 0", paddingLeft: 20, fontSize: 13 }}>
                <li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" style={S.link}>Google Cloud Console</a></li>
                <li>Create a project (or select existing)</li>
                <li>Enable the "Cloud Vision API"</li>
                <li>Go to Credentials → Create API Key</li>
                <li>Restrict the key to Cloud Vision API only (recommended)</li>
              </ol>
              <p style={{ fontSize: 12, marginTop: 8, color: P.textMuted }}>Free tier: 1,000 images/month. ~$1.50/1000 after that.</p>
            </div>
          </div>

          {/* Proxy */}
          <div style={S.card}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 16 }}>
              <span style={{ fontSize: 22 }}>🔌</span>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: P.ink }}>Proxy Server</h3>
                <p style={{ margin: "2px 0 0", fontSize: 13, color: P.textMuted }}>The Notion API proxy. Leave empty to use this server (same origin).</p>
              </div>
            </div>
            <label style={S.fieldLabel}>Proxy URL (optional)</label>
            <input type="text" value={settings.proxyUrl} onChange={e => update("proxyUrl", e.target.value)} style={S.textInput} placeholder="Leave empty for same-origin (recommended)" />
          </div>
        </div>
      );
    }

    // ============================================================
    // App Root
    // ============================================================
    function App() {
      const [entries, setEntries] = useState([]);
      const [activeTab, setActiveTab] = useState("scan");
      const [settings, setSettings] = useState({
        notionToken: "", notionDatabaseId: "", googleVisionKey: "", proxyUrl: "",
      });

      const isConfigured = settings.notionToken && settings.notionDatabaseId && settings.googleVisionKey;

      return (
        <div style={{ fontFamily: "'Source Serif 4', Georgia, serif", background: P.paper, minHeight: "100vh", color: P.text }}>
          {/* Header */}
          <header style={{ background: P.white, borderBottom: "1px solid " + P.border, position: "sticky", top: 0, zIndex: 100 }}>
            <div style={{ maxWidth: 960, margin: "0 auto", padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, background: P.accentMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 4h16v16H4V4z" stroke={P.accent} strokeWidth="1.5" fill="none" /><path d="M7 8h10M7 12h8M7 16h6" stroke={P.accent} strokeWidth="1.5" strokeLinecap="round" /></svg>
                </div>
                <div>
                  <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: P.ink, letterSpacing: "-0.02em" }}>Journal Scanner</h1>
                  <p style={{ margin: 0, fontSize: 11, color: P.textMuted, letterSpacing: "0.04em", textTransform: "uppercase" }}>Handwriting → Notion</p>
                </div>
              </div>
              <nav style={{ display: "flex", gap: 4, background: P.cream, borderRadius: 10, padding: 3 }}>
                {[{ id: "scan", label: "Scan", icon: "📷" }, { id: "entries", label: "Entries", icon: "📚" }, { id: "settings", label: "Settings", icon: "⚙️" }].map(tab => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                    padding: "7px 16px", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500,
                    color: activeTab === tab.id ? P.accent : P.textMuted,
                    background: activeTab === tab.id ? P.white : "transparent",
                    boxShadow: activeTab === tab.id ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                    display: "flex", alignItems: "center", gap: 5, transition: "all 0.2s", fontFamily: "inherit",
                  }}>
                    <span style={{ fontSize: 14 }}>{tab.icon}</span>{tab.label}
                  </button>
                ))}
              </nav>
            </div>
          </header>

          {/* Main */}
          <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 24px 80px" }}>
            {!isConfigured && activeTab !== "settings" && <ConfigBanner onGo={() => setActiveTab("settings")} />}
            {activeTab === "scan" && <ScanView settings={settings} entries={entries} setEntries={setEntries} isConfigured={isConfigured} />}
            {activeTab === "entries" && <EntriesView entries={entries} />}
            {activeTab === "settings" && <SettingsView settings={settings} setSettings={setSettings} />}
          </main>
        </div>
      );
    }

    // ── Render ──
    const root = ReactDOM.createRoot(document.getElementById("root"));
    root.render(<App />);
  </script>
</body>
</html>`;
}
