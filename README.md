# Covify

**Version `1.2.1`** · Interactive 3D Spotify album-art visualizer

Covify connects to your Spotify account and renders your **active playback queue** as interactive album covers in WebGL — primarily a floating **Fibonacci sphere**, with an alternate **drop cascade** layout. You can search the global playlist catalog, open playlists in detail (sphere or list), add tracks to the queue, and control playback from the same dark, Spotify-styled UI.

Runs in the browser (Vite) or as a native desktop app (Tauri 2) for macOS and Windows.

---

## Screenshots

![3D Album Sphere](./Screenshots/Screenshot%202026-06-16%20at%2014.16.31.png)
*3D Album Sphere View*

![Album Drop View](./Screenshots/Screenshot%202026-06-16%20at%2014.17.11.png)
*Album Drop / Card View*

![Song Play & Control View](./Screenshots/Screenshot%202026-06-16%20at%2014.18.18.png)
*Interactive Controls & Song Play View*

---

## How it works

| Concept | Behavior |
|---------|----------|
| **Home visualizer** | Always driven by Spotify’s **Current Queue** (`/me/player/queue`), not by whichever library playlist you last clicked. |
| **Sphere (primary)** | Golden-angle distribution of album art on a sphere. Drag to orbit, scroll to zoom, auto-rotate on. |
| **Drop** | Alternate 3D layout — covers fall into a loose grid with bounce. |
| **List (secondary)** | Overlay listing the same tracks currently in the scene. Sphere remains the main experience. |
| **Playing a playlist** | Starts that playlist on Spotify, then reloads the queue into the sphere so the 3D view stays in sync. |
| **Non-owned playlists** | Spotify Dev Mode only returns track items for playlists you own/collaborate on. Covify uses **Play to Explore**: play first, then fill the sphere from the queue. |

---

## Features

### Visualization
- **3D Sphere** — Fibonacci / golden-angle layout, billboarded covers, orbit + zoom
- **Drop cascade** — Physics-style fall with settle / float
- **Now-playing equalizer** — Animated bars overlaid on the active cover in the scene
- **Larger art** when viewing playlist/queue detail spheres (`artScale` boost)
- **Starfield** backdrop and accent lighting

### Library & search
- **Sidebar** — Profile, disconnect, search, Current Queue, My Playlists
- **Global playlist search** — Debounced search against Spotify’s catalog (10 results per page, Load More)
- **Current Queue** — Opens a dedicated detail view of the live queue (includes currently playing track when missing from the queue API list)
- **My Playlists** — Collapsible list; click to open detail; hover play starts the playlist

### Playlist detail
- Header with cover, owner, track count
- **Sphere | List** toggle (Sphere default / primary)
- Owned playlists: full track load via `/playlists/{id}/items`
- Others: **Play to Explore** flow
- **Add to queue** (`+`) on list rows with toast feedback
- Escape / back restores the home queue sphere

### Playback
- Now-playing bar: art, title, artists, play/pause, prev/next, seek with hover time tooltip
- ~4s Spotify state polling + local progress interpolation (~20 Hz)
- Optimistic UI for controls; short sync suspension after actions
- Idle “Start Playback” prompt when nothing is playing
- Enlarged cover overlay (click art → details + play)

### Desktop (Tauri)
- Native window (1100×720, min 800×600)
- Deep link scheme `covify://` for OAuth callback
- Opens Spotify desktop app on launch (macOS / Windows), then refocuses Covify
- Single-instance plugin

---

## Tech stack

| Layer | Technology | Notes |
|-------|------------|--------|
| UI | Alpine.js 3, Tailwind CSS v4 | Single-page `index.html` + global Alpine store |
| 3D | Three.js | OrbitControls, WebGL canvas |
| Bundler | Vite 8 | Binds to `127.0.0.1:5173`; vendor code-split (three / alpine / tauri) |
| Desktop | Tauri 2 + Rust 2021 | Deep link, shell, store, single-instance |
| Auth | Spotify OAuth PKCE | No client secret in the client |
| API | Spotify Web API v1 | Queue, playlists, search, playback |

Identifier: `com.sammit.covify`

---

## Project structure

```text
Covify/
├── index.html                 # Auth screen + main UI (Alpine templates)
├── package.json               # Scripts & JS dependencies (v1.2.1)
├── vite.config.js             # Dev server, Tailwind plugin, chunk splitting
├── .env.example               # VITE_SPOTIFY_CLIENT_ID
├── README.md
├── SYSTEM_ARCHITECTURE.md     # Deep technical blueprint
├── Screenshots/               # App screenshots
│
├── src/
│   ├── main.js                # Alpine store: auth, queue, search, playback, views
│   ├── style.css              # Design tokens + component styles
│   ├── spotify/
│   │   ├── auth.js            # PKCE OAuth, token storage/refresh
│   │   └── api.js             # Spotify fetch wrapper + endpoints
│   └── three/
│       └── sphere.js          # Scene, sphere/drop layouts, raycast, equalizer
│
├── src-tauri/                 # Native shell
│   ├── tauri.conf.json
│   ├── Cargo.toml
│   ├── capabilities/default.json
│   └── src/lib.rs             # Spotify launch, covify:// OAuth protocol
│
└── .github/workflows/
    └── release.yml            # Tag-triggered macOS + Windows draft releases
```

For math, event bus details, and reproduction notes, see [`SYSTEM_ARCHITECTURE.md`](./SYSTEM_ARCHITECTURE.md).

---

## Requirements

1. **Spotify Premium** — Required for Web API playback control.
2. **Active Spotify player** — Desktop, mobile, or web player must be available as a device.
3. **Node.js** (LTS recommended) for frontend / Tauri builds.
4. **Rust** toolchain for `npm run tauri` / desktop builds.

---

## Spotify Developer setup

1. Create an app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Add these **Redirect URIs** exactly (do **not** use `http://localhost`):

| Mode | Redirect URI |
|------|----------------|
| Browser (Vite) | `http://127.0.0.1:5173/callback` |
| Desktop (Tauri) | `covify://callback` |

3. Copy your **Client ID** into `.env` (see below).

### OAuth scopes

```text
user-read-playback-state
user-modify-playback-state
user-read-currently-playing
playlist-read-private
playlist-read-collaborative
user-library-read
```

Auth flow: **Authorization Code with PKCE**. Tokens live in `localStorage` with automatic refresh; logout clears them.

---

## Setup & run

### 1. Environment

```bash
cp .env.example .env
```

```env
VITE_SPOTIFY_CLIENT_ID=your_spotify_client_id_here
```

### 2. Install

```bash
npm install
```

### 3. Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite only (used by Tauri’s `beforeDevCommand`) |
| `npm run dev:local` | Vite + open `http://127.0.0.1:5173` |
| `npm run build` | Production frontend → `dist/` |
| `npm run preview` | Preview production build |
| `npm run tauri` | Tauri CLI (`tauri dev`, `tauri build`, …) |
| `npm run tauri dev` | Desktop app in development |
| `npm run tauri build` | Native installers under `src-tauri/target/release/bundle/` |

**Browser:** `npm run dev:local`  
**Desktop:** `npm run tauri dev`  
**Installers:** macOS `.dmg` / `.app` (universal in CI), Windows `.msi` / `.exe`

---

## Controls

### Mouse & UI

| Action | Control |
|--------|---------|
| Orbit | Drag background |
| Zoom | Scroll wheel |
| Play cover | Hover → green play button |
| Enlarge cover | Click album art |
| Sphere / Drop | Top-right **SPHERE** / **DROP** |
| Track list | Top-right **List** (secondary) |
| Seek | Click now-playing progress bar |
| Search playlists | Sidebar search |
| Open playlist | Click search result or My Playlist row |
| Current Queue detail | Click **Current Queue** |
| Play playlist | Hover play on a library playlist, or **Play** in detail |
| Add to queue | `+` in list views |
| Refresh all | Top-right **REFRESH** |
| Disconnect | Logout icon in sidebar |

### Keyboard

Ignored while focus is in the search input.

| Key | Action |
|-----|--------|
| `Space` | Play / pause |
| `←` / `→` | Previous / next |
| `M` | Toggle Sphere ↔ Drop |
| `Esc` | Close enlarged view or playlist detail |

---

## Spotify API surface

Covify uses these Web API areas (via `src/spotify/api.js`):

| Area | Endpoints / notes |
|------|-------------------|
| Profile | `GET /me` |
| Library playlists | `GET /me/playlists` |
| Playlist items | `GET /playlists/{id}/items` (owned/collaborative only) |
| Search | `GET /search?type=playlist` — **max limit 10** (Feb 2026 Dev Mode) |
| Queue | `GET /me/player/queue`, `POST /me/player/queue` |
| Playback | `GET /me/player`, play/pause/next/previous/seek |

Client behavior:
- **401** → refresh access token and retry
- **429** → wait `Retry-After` and retry
- **403** on playlist items → treat as non-owned / Play to Explore

### Dev Mode limitations (Feb 2026)

- Search page size capped at **10**
- Playlist **items** only for playlists you own or collaborate on
- Non-owned playlists: metadata only until you play them and load the queue
- Development Mode apps also have Spotify’s account/user quotas (Premium owner, limited users unless Extended Quota)

---

## Releases (GitHub)

Pushing a version tag matching `v*` runs [`.github/workflows/release.yml`](./.github/workflows/release.yml):

- Builds **macOS** (universal) and **Windows**
- Creates a **draft** GitHub Release with installers

```bash
git add -A
git commit -m "release: describe changes"
git push origin main
git tag v1.2.1
git push origin v1.2.1
```

Then open the draft under **Releases**, review assets/notes, and publish.

Keep `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` version fields in sync with the tag.

---

## Design tokens

Spotify-inspired dark theme (`src/style.css`):

| Token | Value | Use |
|-------|-------|-----|
| Surface / panel | `#121212` | Background |
| Card | `#181818` | Bars, overlays |
| Accent | `#1ed760` | CTAs, progress, play |
| Muted | `#b3b3b3` | Secondary text |
| Border | `#4d4d4d` | Hairlines |

---

## Attribution

Music metadata and album art are provided by Spotify. Covify is a third-party client that uses the Spotify Web API; it is not affiliated with Spotify AB. Comply with the [Spotify Developer Terms](https://developer.spotify.com/terms) when redistributing or modifying this project.
