import { getStoredToken, refreshAccessToken } from './auth.js'

const BASE = 'https://api.spotify.com/v1'

async function spotifyFetch(path, options = {}) {
  let token = getStoredToken()
  if (!token) {
    try {
      token = await refreshAccessToken()
    } catch (err) {
      console.error('Initial token refresh failed:', err)
      throw err;
    }
  }

  const url = path.startsWith('http') ? path : `${BASE}${path}`

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  // Handle Rate Limiting (429)
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') || '1', 10)
    console.warn(`[Spotify API] 429 Rate limited. Retrying after ${retryAfter}s...`)
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000))
    // Retry the exact same request
    return spotifyFetch(path, options)
  }

  // Token expired mid-session
  if (res.status === 401) {
    console.warn('Access token expired. Retrying request with refreshed token...')
    token = await refreshAccessToken()
    return fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    }).then(async (retryRes) => {
      if (retryRes.status === 429) {
        // Simple fallback if rate limited on retry, could recurse but keep it simple
        const wait = parseInt(retryRes.headers.get('Retry-After') || '1', 10)
        await new Promise(r => setTimeout(r, wait * 1000))
        return spotifyFetch(path, options)
      }
      if (retryRes.status === 204) return null
      if (!retryRes.ok) {
        const errText = await retryRes.text()
        throw new Error(`Spotify API retry error ${retryRes.status}: ${path} - ${errText}`)
      }
      const retryText = await retryRes.text()
      if (!retryText) return null
      try { return JSON.parse(retryText) } catch (e) { return retryText }
    })
  }

  if (res.status === 204) return null // No content (e.g. play/pause commands)
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Spotify API error ${res.status}: ${path} - ${errText}`)
  }
  
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch (err) {
    return text // return plain text if not JSON (e.g., snapshot IDs)
  }
}

// ── User ──────────────────────────────────────────────────

export async function getCurrentUser() {
  return spotifyFetch('/me')
}

// ── Playlists ─────────────────────────────────────────────

export async function getUserPlaylists(limit = 50) {
  const data = await spotifyFetch(`/me/playlists?limit=${limit}`)
  return data.items.map(p => ({
    id: p.id,
    name: p.name,
    trackCount: p.tracks?.total || 0,
    imageUrl: p.images?.[0]?.url || null,
    uri: p.uri,
  }))
}

export async function getPlaylistTracks(playlistId) {
  const tracks = []
  // Reverting to /tracks as it is the correct documented API path
  let url = `/playlists/${playlistId}/tracks?limit=100&fields=next,items(track(id,name,uri,duration_ms,album(id,name,images),artists(name)))`

  while (url) {
    const data = await spotifyFetch(url)
    const valid = data.items
      .filter(item => item.track && item.track.id) // filter out local files
      .map(item => ({
        id: item.track.id,
        name: item.track.name,
        uri: item.track.uri,
        duration: item.track.duration_ms,
        artists: item.track.artists.map(a => a.name).join(', '),
        albumName: item.track.album.name,
        // Prefer 300px image for textures (not too heavy, not too small)
        imageUrl: item.track.album.images?.find(img => img.width <= 300)?.url
                  || item.track.album.images?.[0]?.url
                  || null,
      }))
    tracks.push(...valid)
    // Handle pagination: next is a full URL
    url = data.next ? data.next.replace(BASE, '') : null
  }

  return tracks
}

export async function getQueueTracks() {
  const data = await spotifyFetch('/me/player/queue')
  if (!data || !data.queue) return []
  
  return data.queue
    .filter(track => track && track.id && track.type === 'track')
    .map(track => ({
      id: track.id,
      name: track.name,
      uri: track.uri,
      duration: track.duration_ms,
      artists: track.artists.map(a => a.name).join(', '),
      albumName: track.album.name,
      imageUrl: track.album.images?.find(img => img.width <= 300)?.url
                || track.album.images?.[0]?.url
                || null,
    }))
}

// ── Playback State ────────────────────────────────────────

export async function getCurrentPlayback() {
  return spotifyFetch('/me/player')
}

// ── Playback Control ──────────────────────────────────────

export async function playTrack(trackUri, contextUri = null, trackUris = null) {
  let body = {}
  if (contextUri) {
    body.context_uri = contextUri
    if (trackUri) {
      body.offset = { uri: trackUri }
    }
  } else if (trackUris && trackUris.length > 0) {
    body.uris = trackUris
    if (trackUri) {
      body.offset = { uri: trackUri }
    }
  } else if (trackUri) {
    body.uris = [trackUri]
  }

  return spotifyFetch('/me/player/play', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export async function pausePlayback() {
  return spotifyFetch('/me/player/pause', { method: 'PUT' })
}

export async function resumePlayback() {
  return spotifyFetch('/me/player/play', { method: 'PUT' })
}

export async function skipToNext() {
  return spotifyFetch('/me/player/next', { method: 'POST' })
}

export async function skipToPrevious() {
  return spotifyFetch('/me/player/previous', { method: 'POST' })
}

export async function seekTo(positionMs) {
  return spotifyFetch(`/me/player/seek?position_ms=${positionMs}`, { method: 'PUT' })
}
