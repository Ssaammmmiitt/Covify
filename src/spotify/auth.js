const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID

// ── Environment detection ───────────────────────────────────────────────────
// Tauri injects __TAURI_INTERNALS__ into the webview. Absent = plain browser.
export const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

// Spotify blocks "localhost" as a redirect URI (security policy).
// Use the loopback IP 127.0.0.1 which Spotify explicitly allows.
// In Tauri we use the custom deep-link scheme registered in tauri.conf.json.
const LOCAL_REDIRECT = 'http://127.0.0.1:5173/callback'
const REDIRECT_URI = IS_TAURI ? 'covify://callback' : LOCAL_REDIRECT

const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
].join(' ')

// Storage Keys
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'sp_access_token',
  REFRESH_TOKEN: 'sp_refresh_token',
  EXPIRES_AT: 'sp_expires_at',
  CODE_VERIFIER: 'sp_code_verifier',
}

// Generates random string for code verifier
function generateRandomString(length) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const values = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(values).map(x => possible[x % possible.length]).join('')
}

// Derives code challenge from code verifier using SHA-256
async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export function saveTokens({ access_token, refresh_token, expires_in }) {
  localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, access_token)
  if (refresh_token) localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refresh_token)
  const expiresAt = Date.now() + (expires_in * 1000) - 60000 // 1 min buffer
  localStorage.setItem(STORAGE_KEYS.EXPIRES_AT, expiresAt.toString())
}

export function getStoredToken() {
  const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)
  const expiresAt = parseInt(localStorage.getItem(STORAGE_KEYS.EXPIRES_AT) || '0')
  if (!token || Date.now() > expiresAt) return null
  return token
}

export function clearTokens() {
  Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k))
}

export async function startAuthFlow() {
  const verifier = generateRandomString(128)
  const challenge = await generateCodeChallenge(verifier)
  localStorage.setItem(STORAGE_KEYS.CODE_VERIFIER, verifier)

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPES,
  })

  const authUrl = `https://accounts.spotify.com/authorize?${params}`

  if (IS_TAURI) {
    // Inside Tauri desktop shell — use the shell plugin to open the system browser.
    // The system browser redirects to covify://callback which macOS routes back to us.
    const { open } = await import('@tauri-apps/plugin-shell')
    await open(authUrl)
  } else {
    // Plain browser dev mode — redirect the current tab to Spotify auth.
    // Spotify redirects back to http://127.0.0.1:5173/callback?code=...
    // Vite serves index.html for that path, Alpine picks up ?code= and exchanges it.
    window.location.href = authUrl
  }
}

export async function exchangeCodeForTokens(code) {
  const verifier = localStorage.getItem(STORAGE_KEYS.CODE_VERIFIER)
  if (!verifier) throw new Error('No code verifier found')

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Token exchange failed: ${response.status} - ${errorText}`)
  }
  const tokens = await response.json()
  saveTokens(tokens)
  localStorage.removeItem(STORAGE_KEYS.CODE_VERIFIER)
  return tokens
}

export async function refreshAccessToken() {
  const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)
  if (!refreshToken) throw new Error('No refresh token available')

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!response.ok) {
    clearTokens()
    throw new Error('Token refresh failed')
  }
  const tokens = await response.json()
  saveTokens(tokens)
  return tokens.access_token
}

export function isAuthenticated() {
  return !!getStoredToken()
}
