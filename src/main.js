import './style.css'
import Alpine from 'alpinejs'
import { listen } from '@tauri-apps/api/event'
import { onOpenUrl } from '@tauri-apps/plugin-deep-link'
import { startAuthFlow, exchangeCodeForTokens, isAuthenticated, clearTokens, getStoredToken, IS_TAURI } from './spotify/auth.js'
import { getCurrentUser, getUserPlaylists, getQueueTracks, getCurrentPlayback, playTrack, pausePlayback, resumePlayback, skipToNext, skipToPrevious, seekTo } from './spotify/api.js'
import { initScene, switchMode, getCurrentMode, destroyScene, buildSphereFromTracks, updatePlaybackState } from './three/sphere.js'

window.Alpine = Alpine

Alpine.store('app', {
  isAuthenticated: isAuthenticated(),
  user: null,
  playlists: [],
  currentPlaylist: null,
  tracks: [],
  currentTrack: null,
  isPlaying: false,
  progress: 0,
  progressMs: 0,
  lastStateSyncTime: Date.now(),
  isLoading: false,
  authError: null,
  sceneMode: 'sphere',
  sceneInitialized: false,
  enlargedTrack: null,
  playlistsError: null,
  tracksError: null,

  async init() {
    console.log('Alpine store initialized, auth state:', this.isAuthenticated)

    // Listen for track clicks from the 3D scene
    window.addEventListener('covify-track-clicked', async (e) => {
      const track = e.detail
      this.playTrackFromSphere(track)
    })

    // Listen for enlarged view events
    window.addEventListener('covify-enlarged-open', (e) => {
      this.enlargedTrack = e.detail.track
    })
    window.addEventListener('covify-enlarged-closed', () => {
      this.enlargedTrack = null
    })

    // Listen for mode changes from the 3D scene
    window.addEventListener('covify-mode-changed', (e) => {
      this.sceneMode = e.detail
    })

    // Listen for keyboard events dispatched by the 3D canvas
    window.addEventListener('covify-key-toggle-play', () => {
      if (this.isAuthenticated) this.togglePlayPause()
    })
    window.addEventListener('covify-key-prev', () => {
      if (this.isAuthenticated) this.skipToPrevious()
    })
    window.addEventListener('covify-key-next', () => {
      if (this.isAuthenticated) this.skipToNext()
    })

    if (this.isAuthenticated) {
      // Await scene init so the tracks-loaded listener is registered
      // BEFORE loadPlaylists() fires selectPlaylist() → tracks-loaded event
      await this.initializeScene()
      this.loadUser()
      this.loadPlaylists()
      this.startPlaybackPolling()
    }

    // Periodically interpolate progress locally for high-precision, smooth progression
    setInterval(() => {
      if (this.isPlaying && this.currentTrack) {
        const elapsed = Date.now() - this.lastStateSyncTime
        const currentMs = Math.min(this.currentTrack.duration, this.progressMs + elapsed)
        this.progress = currentMs / this.currentTrack.duration
      }
    }, 50)

    if (IS_TAURI) {
      // 1. Listen for the Tauri custom scheme event from main.rs/lib.rs
      try {
        await listen('oauth_redirect', (event) => {
          console.log('oauth_redirect event received:', event.payload)
          this.handleRedirectUrl(event.payload)
        })
      } catch (e) {
        console.warn('Failed to register oauth_redirect event listener:', e)
      }

      // 2. Listen for deep link events via the plugin-deep-link
      try {
        await onOpenUrl((urls) => {
          console.log('Deep link plugin received URLs:', urls)
          for (const url of urls) {
            this.handleRedirectUrl(url)
          }
        })
      } catch (e) {
        console.warn('Failed to register deep-link plugin listener:', e)
      }
    }

    // 3. Fallback: Check search params (e.g. for browser testing)
    const urlParams = new URLSearchParams(window.location.search)
    const code = urlParams.get('code')
    if (code) {
      this.handleAuthCallback(code)
      // Clear URL params
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  },

  handleRedirectUrl(urlStr) {
    try {
      const url = new URL(urlStr)
      // Spotify OAuth callback code parameter
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')
      if (error) {
        this.authError = `Auth error: ${error}`
        this.isLoading = false
      } else if (code) {
        this.handleAuthCallback(code)
      }
    } catch (err) {
      console.error('Failed to parse redirect URL:', urlStr, err)
    }
  },

  async handleAuthCallback(code) {
    this.isLoading = true
    this.authError = null
    try {
      await exchangeCodeForTokens(code)
      this.isAuthenticated = true
      this.initializeScene()
      this.loadUser()
      this.loadPlaylists()
    } catch (err) {
      this.authError = err.message
    } finally {
      this.isLoading = false
    }
  },

  async connectSpotify() {
    this.isLoading = true
    this.authError = null
    try {
      await startAuthFlow()
    } catch (err) {
      this.authError = err.message
      this.isLoading = false
    }
  },

  logout() {
    clearTokens()
    destroyScene()
    this.stopPlaybackPolling()
    this.isAuthenticated = false
    this.user = null
    this.playlists = []
    this.currentPlaylist = null
    this.tracks = []
    this.currentTrack = null
    this.isPlaying = false
    this.progress = 0
    this.sceneInitialized = false
    this.enlargedTrack = null
  },

  pollingInterval: null,
  syncSuspendedUntil: 0,

  async playTrackFromSphere(track) {
    this.currentTrack = track
    this.isPlaying = true
    this.progress = 0
    this.progressMs = 0
    this.lastStateSyncTime = Date.now()
    // Suspend polling so optimistic update sticks
    this.syncSuspendedUntil = Date.now() + 3000

    // Update 3D scene immediately
    try {
      updatePlaybackState(track.uri, true)
    } catch (e) {
      console.warn('Failed to update 3D playback state:', e)
    }

    try {
      // Pass the current playlist URI as context, fallback to all loaded tracks for Liked Songs / Queue
      const trackUris = this.tracks.map(t => t.uri)
      await playTrack(track.uri, this.currentPlaylist?.uri, trackUris)
    } catch (err) {
      console.error('Failed to play track:', err)
      this.syncSuspendedUntil = 0
    }
  },

  async playPlaylist(playlist) {
    if (!playlist) return
    if (playlist.id === 'queue') {
      if (this.tracks && this.tracks.length > 0) {
        await this.playTrackFromSphere(this.tracks[0])
      }
      return
    }
    if (!playlist.uri) return // e.g. for virtual playlists without URIs
    // Suspend polling
    this.syncSuspendedUntil = Date.now() + 3000
    this.isPlaying = true
    this.currentTrack = null
    this.progress = 0
    this.progressMs = 0
    this.lastStateSyncTime = Date.now()
    try {
      // Play the playlist from the start
      await playTrack(null, playlist.uri)
      // Keep app on current queue, and trigger queue reload after 1 second
      setTimeout(async () => {
        await this.selectPlaylist('queue')
        await this.syncPlaybackState()
      }, 1000)
    } catch (err) {
      console.error('Failed to play playlist:', err)
      this.syncSuspendedUntil = 0
    }
  },

  startPlaybackPolling() {
    if (this.pollingInterval) clearInterval(this.pollingInterval)
    this.syncPlaybackState()
    this.pollingInterval = setInterval(() => {
      this.syncPlaybackState()
    }, 4000)
  },

  stopPlaybackPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }
  },

  initializeScene() {
    if (this.sceneInitialized) return Promise.resolve()
    return new Promise(resolve => {
      // Allow one rAF for x-show to apply display:flex before we measure canvas size
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          initScene('three-canvas')
          this.sceneInitialized = true
          // If tracks were already fetched before scene was ready, render them now
          if (this.tracks && this.tracks.length > 0) {
            buildSphereFromTracks(this.tracks)
          }
          resolve()
        })
      })
    })
  },

  toggleSceneMode() {
    const newMode = this.sceneMode === 'sphere' ? 'drop' : 'sphere'
    this.sceneMode = newMode
    switchMode(newMode)
  },

  closeEnlargedView() {
    this.enlargedTrack = null
    window.dispatchEvent(new CustomEvent('covify-close-enlarged'))
  },

  async loadUser() {
    try {
      this.user = await getCurrentUser()
    } catch (err) {
      console.error('Failed to load user profile:', err)
    }
  },

  async loadPlaylists() {
    this.playlistsError = null
    try {
      const userPlaylists = await getUserPlaylists()
      
      // Inject standard virtual playlists
      this.playlists = [
        { id: 'queue', name: 'Current Queue', trackCount: 'Dynamic', imageUrl: null, uri: null },
        ...userPlaylists
      ]
      
      console.log('[Covify] Loaded', this.playlists.length, 'playlists')
      
      // Always select queue by default
      await this.selectPlaylist('queue')
    } catch (err) {
      console.error('[Covify] Failed to load playlists:', err)
      this.playlistsError = err.message || 'Failed to load playlists'
    }
  },

  async selectPlaylist(playlistId) {
    this.isLoading = true
    this.tracksError = null
    this.tracks = [] // clear previous tracks
    try {
      // Force loading queue since we are always on the queue
      const targetId = 'queue'
      this.currentPlaylist = this.playlists.find(p => p.id === targetId)
      this.tracks = await getQueueTracks()
      
      console.log('[Covify] Loaded', this.tracks.length, 'tracks for current queue')

      // Call sphere builder directly — no event bus race condition
      buildSphereFromTracks(this.tracks)
    } catch (err) {
      console.error('Failed to load tracks for queue:', err)
      this.tracksError = err.message || 'Failed to load tracks. The queue might be private or restricted by Spotify.'
      // If we failed, clear the sphere
      if (this.sceneInitialized) {
        buildSphereFromTracks([])
      }
    } finally {
      this.isLoading = false
    }
  },

  async togglePlayPause() {
    // Optimistic update — flip the icon immediately for instant feedback
    const wasPlaying = this.isPlaying
    this.isPlaying = !wasPlaying
    // Suspend polling for 3 seconds to let Spotify catch up
    this.syncSuspendedUntil = Date.now() + 3000
    
    // Freeze progress if pausing, or reset start time if resuming
    if (wasPlaying && this.currentTrack) {
      const elapsed = Date.now() - this.lastStateSyncTime
      this.progressMs = Math.min(this.currentTrack.duration, this.progressMs + elapsed)
    } else {
      this.lastStateSyncTime = Date.now()
    }
    
    // Update 3D scene immediately
    try {
      updatePlaybackState(this.currentTrack?.uri, this.isPlaying)
    } catch (e) {
      console.warn('Failed to update 3D playback state:', e)
    }

    try {
      if (wasPlaying) {
        await pausePlayback()
      } else {
        await resumePlayback()
      }
    } catch (err) {
      // Revert on failure
      this.isPlaying = wasPlaying
      this.syncSuspendedUntil = 0
      try {
        updatePlaybackState(this.currentTrack?.uri, this.isPlaying)
      } catch (e) {}
      console.error('Failed to toggle play/pause:', err)
    }
  },

  async skipToNext() {
    this.syncSuspendedUntil = Date.now() + 3000
    try {
      await skipToNext() // wait for it to process
      setTimeout(() => this.syncPlaybackState(), 1000)
    } catch (err) {
      console.error('Failed to skip to next:', err)
      this.syncSuspendedUntil = 0
    }
  },

  async skipToPrevious() {
    this.syncSuspendedUntil = Date.now() + 3000
    try {
      await skipToPrevious()
      setTimeout(() => this.syncPlaybackState(), 1000)
    } catch (err) {
      console.error('Failed to skip to previous:', err)
      this.syncSuspendedUntil = 0
    }
  },

  async syncPlaybackState() {
    if (Date.now() < this.syncSuspendedUntil) return // Skip sync during optimistic updates
    try {
      const state = await getCurrentPlayback()
      if (!state) {
        // No active playback state (e.g., no active device)
        this.isPlaying = false
        // Keep currentTrack if it exists so the box doesn't disappear
        this.progress = 0
        this.progressMs = 0
        try {
          updatePlaybackState(this.currentTrack?.uri, false)
        } catch (e) {}
        return
      }
      
      const oldTrackId = this.currentTrack?.id
      
      this.isPlaying = state.is_playing
      if (state.item) {
        this.currentTrack = {
          id: state.item.id,
          name: state.item.name,
          artists: state.item.artists ? state.item.artists.map(a => a.name).join(', ') : 'Unknown',
          imageUrl: state.item.album?.images?.[0]?.url || null,
          uri: state.item.uri,
          duration: state.item.duration_ms || 1, // avoid div by zero
        }
      }
      this.progressMs = state.progress_ms || 0
      this.lastStateSyncTime = Date.now()
      this.progress = this.currentTrack && state.progress_ms ? state.progress_ms / (this.currentTrack.duration || 1) : 0

      // Sync the 3D scene equalizer
      try {
        updatePlaybackState(this.currentTrack?.uri, this.isPlaying)
      } catch (e) {}

      // If active song changed, reload queue tracks to keep the sphere current
      const newTrackId = this.currentTrack?.id
      if (oldTrackId && newTrackId !== oldTrackId) {
        this.selectPlaylist('queue')
      }
    } catch (err) {
      console.error('Failed to sync playback state:', err)
    }
  },

  async seekToProgress(event) {
    if (!this.currentTrack) return
    const rect = event.currentTarget.getBoundingClientRect()
    const clickX = event.clientX - rect.left
    const percentage = clickX / rect.width
    this.progress = Math.max(0, Math.min(1, percentage))
    this.progressMs = Math.round(this.progress * this.currentTrack.duration)
    this.lastStateSyncTime = Date.now()
    try {
      await seekTo(this.progressMs)
    } catch (err) {
      console.error('Failed to seek:', err)
    }
  },

  formatTime(ms) {
    if (isNaN(ms) || ms < 0) return '0:00'
    const seconds = Math.floor(ms / 1000)
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s < 10 ? '0' : ''}${s}`
  },



  async refreshAll() {
    this.isLoading = true
    this.playlistsError = null
    this.tracksError = null
    try {
      await this.loadPlaylists()
      if (this.currentPlaylist) {
        await this.selectPlaylist(this.currentPlaylist.id)
      }
      await this.syncPlaybackState()
    } catch (err) {
      console.error('Refresh all failed:', err)
    } finally {
      this.isLoading = false
    }
  }
})

Alpine.start()
