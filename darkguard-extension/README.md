# DarkGuard — Standalone Chrome Extension

Manifest V3 extension by **Trusten**: detects common dark-pattern signals on real pages, merges results from **DOM rules**, **text/regex rules**, and optional **Google Gemini**, then draws **inline overlays** and a **floating summary panel**.

No build step, no backend — load the folder directly in Chrome.

---

## Requirements

- Chromium-based browser with **Manifest V3** support (e.g. Google Chrome, Microsoft Edge).
- Optional: [Google AI Studio](https://aistudio.google.com/apikey) API key for the AI analyzer.

---

## Installation

1. Open **`chrome://extensions`** (or **`edge://extensions`** in Edge).
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder: the one that contains **`manifest.json`** (`darkguard-extension`).

Pin the extension for quicker access.

---

## Configuration

1. Click the **DarkGuard** icon to open the popup.
2. At the bottom, paste your **Gemini API key** and click **Save**.  
   - Stored in `chrome.storage.local` as **`GEMINI_API_KEY`**.  
   - Never committed to git; only your browser holds it.
3. If you skip the key, **DOM** and **Text** analyzers still run; **AI** returns no extra findings.

### Change the Gemini model

In **`background.js`**, edit **`GEMINI_MODEL`** (default: `gemini-2.0-flash`). If the API rejects the model, try e.g. **`gemini-1.5-flash`**, then reload the extension on the extensions page.

---

## How to use

1. Navigate to a normal **https://** page (not `chrome://`, `edge://`, or `about:` — those cannot be scripted).
2. Open the popup → **Scan Page**.  
   - Injects **`content.js`** + **`overlay.css`**, collects signals, runs analyzers, saves results for this tab, and sends overlays to the page.
3. On the page:
   - **Bounding boxes** mark approximate locations; **hover** for tooltip (pattern id, title, copy, regulation).
   - **Panel** (bottom-right): grade, numeric score, short label, finding count, **View Details** (may not open the popup from the page on all Chrome versions — use the toolbar icon if needed).
4. **Clear** in the popup removes overlays and clears session data for the **current tab**.

After editing any file here, use **Reload** on **`chrome://extensions`** for this extension.

---

## Permissions (why they exist)

| Permission / host | Role |
|-------------------|------|
| `activeTab` | Operate on the tab you interact with. |
| `scripting` | Inject content script and CSS when you scan. |
| `storage` | Popup settings + per-tab scan results (session). |
| `<all_urls>` | Run on arbitrary sites you choose to scan. |
| `generativelanguage.googleapis.com` | Call Gemini from the service worker. |

---

## Files

| File | Role |
|------|------|
| `manifest.json` | MV3 entry, permissions, popup, web-accessible `overlay.css`. |
| `background.js` | Service worker: inject, message handlers, three analyzers, scoring, Gemini. |
| `content.js` | Extract signals (incl. open shadow DOM where possible), render/clear overlays. |
| `overlay.css` | Overlay + panel styles (high z-index). |
| `popup.html` / `popup.js` / `popup.css` | UI: score ring, findings list, scan/clear, API key. |
| `icons/` | Toolbar icons. |

---

## Monorepo note

This folder lives inside the larger **DarkGuard** repository, which also includes a **Django backend** and a separate **Svelte** extension under **`extension/`**. For the full-stack setup, see the **[root README.md](../README.md)**.
