# Project Progress

## Current Features
- Spotify OAuth with PKCE (Local and Tauri deep-link support)
- Loading User Playlists and Active Queue.
- 3D Rendering of album arts (Sphere and Drop modes).
- 3D Now Playing Equalizer Overlay: A beautiful dynamic canvas-based equalizer overlay that renders on top of the currently playing track's album art in real-time, animates when playing, and goes flat when paused.
- Raycasted interactions: Hover to enlarge/view tooltip, click to play.
- Softer 3D Hover Glow: Reduced emissive hover glow in `sphere.js` to `0.04` (about 25% of current intensity) for a cleaner, modern look.
- 2D Overlay for enlarged track inspection.
- UI Overhaul matching Spotify's dark-mode design system (`#121212` backgrounds, pill buttons, heavy shadows).
- Global REFRESH button: One unified refresh button at the top bar to reload playlists, the active playlist tracks, and sync the playback status in one click.
- Playback context-awareness: Playing a track loads the entire playlist into the queue to keep playback context.
- Progress bar seeking: Users can click on the playback progress bar to seek.
- Progress bar hover timeline: Self-contained local Alpine component hover timelines and cursor offset. Displays a timestamp tooltip showing the time corresponding to the hovered point.
- Playback bar timestamps: Shows the `current_time / duration` format next to controls.
- Collapsible Sidebar Accordion: Grouped user playlists under a collapsible accordion dropdown containing the cover art and name, where the playlist rows are unclickable (visual-only) and only their inline play buttons are clickable.
- Active Queue Locked Visualizer: The 3D scene permanently visualizes the active Spotify "Current Queue" by default, automatically reloading the queue tracks whenever the song changes or when a playlist is played.
- Persistent selected playlist: The visualizer stays locked onto the active queue on startup and updates dynamically with Spotify's active playback state.
- Center Idle Playback Prompt Modal: Displayed a premium glassmorphic prompt card in the center of the canvas if Spotify is inactive, allowing users to start the playlist with a single click.
- Packaged desktop launcher: Packaged native desktop app via Tauri v2 that automatically launches the official Spotify player app on macOS (`open -a Spotify`) and Windows (`cmd /C start spotify:`) at startup.

## Errors Faced & Resolved
- `403 Forbidden` on Playlist Tracks: Spotify API endpoint path was incorrectly pointed to `/items` instead of `/tracks`. Reverted to `/tracks`.
- Discovery Weekly/Algorithmic Playlists: Blocked by Spotify for third-party apps, returning 403 Forbidden.
- Playback Reset/Queue Overwrite: Resolved by deleting the duplicate `playTrackFromSphere` method which bypassed context, restoring proper context/track-list playing, and persisting selection in `localStorage`.
- Progress Bar Desync: Dynamic system-clock-based (`progressMs + elapsed`) rendering at 20fps ensures drift-free progression.
- Tooltip Hover Flicker: Fixed by keeping hover state context local to the progress bar container, completely eliminating binding delays or reactivity lag.

## Current Status
All requested sidebar changes, prompt overlays, visual soft glows, and code cleanup tasks completed successfully. Bundled desktop package compiles and generates installable packages cleanly.
