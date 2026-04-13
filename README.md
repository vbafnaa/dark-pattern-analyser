# DarkGuard

Trust and dark-pattern awareness for the web: **DarkGuard** ships as either a **standalone Chrome extension** (no server, no build) or a **full-stack** setup with a Django API and a TypeScript/Svelte extension.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

---

## What you get

- **On-page highlights**: Colored bounding boxes on elements tied to detected patterns, with hover tooltips (name, description, regulation, corroboration).
- **Popup dashboard**: Trust score (A+–F), summary label, grouped findings, and controls to scan or clear.
- **Multiple analyzers**: Rule-based DOM and text checks, plus an optional **Google Gemini** pass for harder-to-catch patterns (standalone extension). The full-stack repo can additionally use a Django backend with DOM, text, visual, and review analyzers.

---

## Choose how you run it

| Path | Best for | Backend | Build |
|------|----------|---------|--------|
| **[`darkguard-extension/`](darkguard-extension/)** | Quick demo, hackathons, local testing | None | None |
| **[`extension/`](extension/) + [`backend/`](backend/)** | Research, API-driven analysis, team workflows | Django | `npm run build` |

---

## Option A — Standalone extension (`darkguard-extension/`)

Pure JavaScript Manifest V3 extension: all detection runs in the browser (service worker + content script). **No `npm install` and no Python.**

### Prerequisites

- [Google Chrome](https://www.google.com/chrome/) (or another Chromium browser with MV3 support)

### Install in Chrome

1. Open **`chrome://extensions`**.
2. Turn **Developer mode** on (top right).
3. Click **Load unpacked**.
4. Select the folder: **`darkguard-extension`** (the directory that contains `manifest.json`).

Pin the extension from the puzzle icon if you want one-click access to the popup.

### First-time setup

1. Click the **DarkGuard** toolbar icon to open the popup.
2. Scroll to **API Key**, paste a [Google AI Studio](https://aistudio.google.com/apikey) key, and click **Save**.  
   - The key is stored locally as `GEMINI_API_KEY`.  
   - If you leave it empty, **DOM** and **Text** analyzers still run; the **AI** analyzer is skipped.
3. Open a normal website (e.g. a shopping or booking site — not `chrome://` pages).

### Using the extension

1. With the target tab active, open the popup and click **Scan Page**.  
   - The extension injects the content script, collects page signals (including open shadow roots where possible), runs analyzers, then draws overlays.
2. On the page you will see:
   - **Outlined regions** for each finding (severity: high / medium / low).
   - A **floating panel** (bottom-right) with grade, score, short summary, and **View Details** (opens the popup when the browser allows it).
3. Hover a box to read the full tooltip.
4. **Clear** removes overlays and the panel for the current tab (and clears the tab’s cached results in session storage).

### Reload after code changes

After editing files under `darkguard-extension/`, go to **`chrome://extensions`** and click **Reload** on DarkGuard.

### AI model (optional tweak)

The service worker uses **`gemini-2.0-flash`** by default (`GEMINI_MODEL` in `darkguard-extension/background.js`). If your key cannot use that model, change it (for example to `gemini-1.5-flash`) and reload the extension.

### Standalone layout

```
darkguard-extension/
├── manifest.json      # MV3 manifest, permissions, popup
├── background.js      # Service worker: analyzers, Gemini, storage
├── content.js         # Signals + overlay rendering
├── overlay.css        # Injected overlay styles
├── popup.html         # Popup markup
├── popup.js / popup.css
├── icons/             # Toolbar icons
└── README.md          # Extension-focused notes
```

More detail: **[darkguard-extension/README.md](darkguard-extension/README.md)**.

---

## Option B — Full stack (`backend/` + `extension/`)

Uses a **Django REST** backend and a **Vite + Svelte** extension that talks to the API.

### Prerequisites

- **Python 3.12+**
- **Node.js 20+**
- **Google Chrome**

### 1. Run the backend

```bash
cd backend
python -m venv .venv
```

**Windows (PowerShell):**

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy ..\.env.example .env   # then edit .env with your settings
python manage.py runserver
```

**macOS / Linux:**

```bash
source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env     # then edit .env
python manage.py runserver
```

The API defaults to `http://127.0.0.1:8000/` unless you change it.

### 2. Build and load the Svelte extension

```bash
cd extension
npm install
npm run build
```

In Chrome: **`chrome://extensions`** → Developer mode → **Load unpacked** → choose **`extension/dist/`** (the build output).

Configure the extension to point at your backend URL if it differs from the default (see **`extension/README.md`**).

### Full-stack architecture (conceptual)

```
┌─────────────────────────┐     POST /api/analyze      ┌──────────────────────────┐
│   Chrome Extension      │ ─────────────────────────► │   Django Backend         │
│   (extension/)          │ ◄───────────────────────── │   (analyzers + API)      │
└─────────────────────────┘                             └──────────────────────────┘
```

Diagrams and depth: **[docs/architecture.md](docs/architecture.md)**, **[docs/data-flow.md](docs/data-flow.md)**.

---

## Repository layout

```
darkguard-main/
├── darkguard-extension/   # Standalone MV3 extension (no build)
├── extension/             # TypeScript + Svelte MV3 extension (npm build → dist/)
├── backend/               # Django REST API + analyzer packages
├── docs/                  # Architecture, API, privacy, analyzers
├── .env.example
├── LICENSE
└── README.md
```

---

## Documentation index

| Document | Description |
|----------|-------------|
| [docs/architecture.md](docs/architecture.md) | System architecture |
| [docs/data-flow.md](docs/data-flow.md) | Data flow |
| [docs/analyzers.md](docs/analyzers.md) | Analyzer behavior (full stack) |
| [docs/privacy.md](docs/privacy.md) | Privacy / PII notes |
| [docs/api.md](docs/api.md) | REST API reference |
| [extension/README.md](extension/README.md) | Svelte extension build & config |
| [backend/README.md](backend/README.md) | Backend development |
| [darkguard-extension/README.md](darkguard-extension/README.md) | Standalone extension |

---

## Contributing

1. Fork the repository and create a branch for your change.
2. For **`extension/`**: follow existing TypeScript/Svelte conventions.
3. For **`backend/`**: follow PEP 8 and keep analyzer modules decoupled.
4. Open a Pull Request with a clear description.

---

## License

This project is licensed under the **GNU General Public License v3.0** — see [LICENSE](LICENSE).
