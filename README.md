# Covify 3D

Covify is a beautiful, interactive 3D visualizer for your Spotify music. It loads your music and renders your album art covers as a floating 3D sphere or falling cards.

## 📸 Screenshots

![3D Album Sphere](./Screenshots/Screenshot%202026-06-16%20at%2014.16.31.png)
*3D Album Sphere View*

![Album Drop View](./Screenshots/Screenshot%202026-06-16%20at%2014.17.11.png)
*Album Drop / Card View*

![Song Play & Control View](./Screenshots/Screenshot%202026-06-16%20at%2014.18.18.png)
*Interactive Controls & Song Play View*


---

## ️ Requirements to Play Music
For the 3D buttons and controls (play, pause, skip, seek) to work:
1. **Spotify Premium**: Spotify's API only allows premium accounts to control music.
2. **Active Player**: You must have Spotify open and running somewhere (your phone, browser, or desktop app) so Covify can connect to it.
3. **Spotify App**: Covify will try to automatically open the Spotify desktop application in the background when it launches.

---

##  How to Setup and Run

### 1. Configure your API Keys
Create a file named `.env` in the main folder and add your Spotify Client ID (you can copy `.env.example` to start):
```env
VITE_SPOTIFY_CLIENT_ID=your_spotify_client_id_here
```

### 2. Install dependencies
Open your terminal in this folder and run:
```bash
npm install
```

### 3. Run the Web App (Browser Mode)
To run the visualizer in your web browser:
```bash
npm run dev:local
```
This will start the server and open the app in your browser at `http://127.0.0.1:5173`.

### 4. Run the Desktop App (Development Mode)
To run the native desktop window app on your computer:
```bash
npm run tauri dev
```

### 5. Build the Desktop App Installer (Production Mode)
To package the app into an installer (.dmg for macOS, or .msi for Windows), run:
```bash
npm run tauri build
```
The installer files will be generated in `src-tauri/target/release/bundle/`.

---

##  Interactive Controls
- **Orbit View**: Click and drag on the background to rotate the 3D sphere.
- **Enlarge Cover**: Click on any album art cover to zoom in and see its details.
- **Play Song**: Hover over an album cover and click the green play button that appears to play that track.
- **Switch Views**: Click the "SPHERE" or "DROP" buttons at the top right to change the layout style.
- **Timeline Seek**: Hover over the bottom timeline progress bar to see timestamps, and click anywhere on the bar to seek the song.
- **Refresh**: Click the "REFRESH" button at the top right to sync the 3D scene with your current Spotify state.
