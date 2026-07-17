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

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') || '1', 10)
    console.warn(`[Spotify API] 429 Rate limited. Retrying after ${retryAfter}s...`)
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000))
    return spotifyFetch(path, options)
  }

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

  if (res.status === 204) return null
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Spotify API error ${res.status}: ${path} - ${errText}`)
  }
  
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch (err) {
    return text
  }
}

// ── User ──────────────────────────────────────────────────

export async function getCurrentUser() {
  return spotifyFetch('/me')
}

// ── Playlists ─────────────────────────────────────────────

export async function getUserPlaylists(limit = 50) {
  const data = await spotifyFetch(`/me/playlists?limit=${limit}`)
  if (!data?.items) return []
  return data.items.map(p => ({
    id: p.id,
    name: p.name,
    trackCount: p.items?.total ?? p.tracks?.total ?? 0,
    imageUrl: p.images?.[0]?.url || null,
    uri: p.uri,
    owner: p.owner?.display_name || 'Unknown',
    isOwned: true,
  }))
}

/**
 * Fetch tracks for a playlist the user owns or collaborates on.
 * Uses the new /items endpoint (Feb 2026 migration).
 * Returns empty array for non-owned playlists (API returns 403).
 */
export async function getPlaylistTracks(playlistId) {
  const tracks = []
  let url = `/playlists/${playlistId}/items?limit=50`

  while (url) {
    let data
    try {
      data = await spotifyFetch(url)
    } catch (err) {
      if (err.message?.includes('403') || err.message?.includes('Forbidden')) {
        console.warn(`[Spotify API] Cannot access tracks for playlist ${playlistId} (not owned)`)
        return tracks
      }
      throw err
    }
    if (!data || !data.items) break

    const valid = data.items
      .filter(entry => {
        const t = entry.item || entry.track
        return t && t.id
      })
      .map(entry => {
        const t = entry.item || entry.track
        return {
          id: t.id,
          name: t.name,
          uri: t.uri,
          duration: t.duration_ms,
          artists: t.artists?.map(a => a.name).join(', ') || 'Unknown',
          albumName: t.album?.name || 'Unknown Album',
          imageUrl: t.album?.images?.find(img => img.width <= 300)?.url
                    || t.album?.images?.[0]?.url
                    || null,
        }
      })
    tracks.push(...valid)
    url = data.next || null
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
      artists: track.artists?.map(a => a.name).join(', ') || 'Unknown',
      albumName: track.album?.name || 'Unknown Album',
      imageUrl: track.album?.images?.find(img => img.width <= 300)?.url
                || track.album?.images?.[0]?.url
                || null,
    }))
}

// ── Search ────────────────────────────────────────────────
// Feb 2026: limit max is 10, default is 5

export async function searchPlaylists(query, limit = 10, offset = 0) {
  const clampedLimit = Math.min(limit, 10)
  const data = await spotifyFetch(`/search?q=${encodeURIComponent(query)}&type=playlist&limit=${clampedLimit}&offset=${offset}`)
  if (!data?.playlists?.items) return { items: [], total: 0 }
  return {
    items: data.playlists.items.filter(Boolean).map(p => ({
      id: p.id,
      name: p.name,
      description: p.description || '',
      trackCount: p.items?.total ?? p.tracks?.total ?? 0,
      imageUrl: p.images?.[0]?.url || null,
      uri: p.uri,
      owner: p.owner?.display_name || 'Unknown',
    })),
    total: data.playlists.total || 0,
    next: data.playlists.next || null,
  }
}

/**
 * Fetch playlist metadata. Track listing may be absent for non-owned playlists.
 */
export async function getPlaylistDetails(playlistId) {
  const data = await spotifyFetch(`/playlists/${playlistId}`)
  return {
    id: data.id,
    name: data.name,
    description: data.description || '',
    imageUrl: data.images?.[0]?.url || null,
    uri: data.uri,
    owner: data.owner?.display_name || 'Unknown',
    trackCount: data.items?.total ?? data.tracks?.total ?? 0,
  }
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
