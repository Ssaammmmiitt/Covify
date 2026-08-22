# Covify 3D

Covify is an interactive 3D Spotify visualizer. It renders your **active Spotify queue** as album-art covers in a floating sphere (or a falling-card “drop” layout), and lets you search playlists, open them in detail, and control playback from the same UI.

**Current version:** `1.2.1`

## Screenshots

![3D Album Sphere](./Screenshots/Screenshot%202026-06-16%20at%2014.16.31.png)
*3D Album Sphere View*

![Album Drop View](./Screenshots/Screenshot%202026-06-16%20at%2014.17.11.png)
*Album Drop / Card View*

![Song Play & Control View](./Screenshots/Screenshot%202026-06-16%20at%2014.18.18.png)
*Interactive Controls & Song Play View*

---

## How it works

The **home sphere always visualizes your Spotify queue**, not a library playlist by itself. When you play a playlist from the sidebar or search, Spotify starts that playlist and Covify reloads the queue into the 3D scene.

- **Sphere** is the primary experience (drag to orbit, scroll to zoom, hover to play).
- **Drop** is an alternate 3D layout.
- **List** is a secondary overlay for browsing the same tracks as a normal track list.

---

## Requirements

1. **Spotify Premium** — Web API playback control requires Premium.
2. **Active player** — Spotify must be open somewhere (desktop, phone, or web) so Covify has a device to control.
3. **Desktop helper** — In the Tauri app, Covify tries to open the Spotify desktop app on launch (macOS / Windows).

---

## Features

- **3D album sphere** — Queue covers on a golden-angle sphere with orbit, zoom, hover play, and a now-playing equalizer overlay
- **Drop cascade** — Alternate physics-style falling-card layout
- **Secondary List view** — Browse current sphere tracks as a list; return to Sphere anytime
- **Playlist search** — Search Spotify’s catalog, paginate results, open any playlist
- **Playlist detail** — Sphere or list for owned/collaborative playlists; **Play to Explore** for others (API restriction)
- **Current Queue** — Sidebar entry opens the live queue in its own sphere/list detail view
- **Add to queue** — `+` on list rows queues a track on Spotify
- **Now playing bar** — Play/pause, skip, seek with hover timestamps
- **Enlarged cover** — Click art to zoom in and play that track
- **PKCE OAuth** — Secure Spotify login with no client secret in the app

---

## Stack

| Layer | Tech |
|-------|------|
| UI | Alpine.js, Tailwind CSS v4 |
| 3D | Three.js |
| Build | Vite 8 |
| Desktop | Tauri 2 (Rust) |
| Auth | Spotify Authorization Code + PKCE |

---

## Setup

### 1. Spotify Developer Dashboard

Create an app and set these **Redirect URIs** (do not use `http://localhost`):

| Mode | Redirect URI |
|------|----------------|
| Browser / Vite | `http://127.0.0.1:5173/callback` |
| Desktop (Tauri) | `covify://callback` |

Scopes used by Covify:

```text
user-read-playback-state
user-modify-playback-state
user-read-currently-playing
playlist-read-private
playlist-read-collaborative
user-library-read
```

### 2. Environment

Copy `.env.example` to `.env` and add your Client ID:

```env
VITE_SPOTIFY_CLIENT_ID=your_spotify_client_id_here
```

### 3. Install

```bash
npm install
```

### 4. Run

**Browser**

```bash
npm run dev:local
```

Opens `http://127.0.0.1:5173`.

**Desktop (dev)**

```bash
npm run tauri dev
```

**Desktop installer (production)**

```bash
npm run tauri build
```

Installers land in `src-tauri/target/release/bundle/` (`.dmg` / `.app` on macOS, `.msi` / `.exe` on Windows).

Other scripts: `npm run build` (Vite production), `npm run preview`.

---

## Controls

### Mouse / UI

| Action | How |
|--------|-----|
| Orbit | Drag on the scene |
| Zoom | Scroll |
| Play a cover | Hover → green play button |
| Enlarge cover | Click album art |
| Sphere / Drop | Top-right **SPHERE** / **DROP** |
| List (secondary) | Top-right **List** |
| Seek | Click the now-playing progress bar |
| Search | Sidebar search field |
| Open playlist | Click a search result or library playlist |
| Current Queue | Click **Current Queue** in the sidebar |
| Add to queue | `+` in list view |
| Refresh | Top-right **REFRESH** |

### Keyboard

| Key | Action |
|-----|--------|
| `Space` | Play / pause |
| `←` / `→` | Previous / next track |
| `M` | Toggle Sphere ↔ Drop |
| `Esc` | Close enlarged view or playlist detail |

Shortcuts are ignored while typing in the search field.

---

## Spotify API notes (Dev Mode)

Covify targets the Spotify Web API under **February 2026 Development Mode** limits:

- **Search** — Max 10 results per request (paginated with Load More)
- **Playlist tracks** — `/playlists/{id}/items` only for playlists you **own or collaborate on**
- **Other playlists** — Metadata only; use **Play to Explore** so tracks appear via the queue
- **Home visualizer** — Driven by `/me/player/queue`
- **Auth** — Authorization Code with PKCE (no client secret in the client)
- **Rate limits** — `429` responses honor `Retry-After`

---

## Releases

Pushing a version tag (`v1.2.1`, etc.) runs GitHub Actions to build macOS (universal) and Windows installers and open a **draft** GitHub Release.

```bash
git tag v1.2.1
git push origin v1.2.1
```

Content is from Spotify. Always attribute Spotify when sharing Covify.
