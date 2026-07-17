/**
 * Covify — 3D Scene Module
 * Golden Angle Sphere · Drop Cascade · Raycasted Interaction
 *
 * Design tokens sourced from DESIGN.md (Nocturne Stage):
 *   surface: #0c0c12 | neutral: #15151c | accent: #ff2e7e
 *   card hairline: rgba(244,241,236,0.08)
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

// ── Design Tokens ─────────────────────────────────────────
const COLORS = {
  surface: 0x121212,
  neutral: 0x181818,
  accent: 0x1ed760,
  bone: 0xffffff,
  muted: 0xb3b3b3,
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)) // ~137.508°

// ── Layout modes ──────────────────────────────────────────
const MODE = {
  SPHERE: 'sphere',
  DROP: 'drop',
}

// ── Scene State ───────────────────────────────────────────
let scene, camera, renderer, controls
let raycaster, mouse
let artMeshes = []       // All album art plane meshes
let trackDataMap = new Map() // mesh.uuid → track data
let currentMode = MODE.SPHERE
let animationId = null
let containerEl = null
let tooltipEl = null
let hoveredMesh = null
let selectedMesh = null  // For enlarged view
let isEnlargedView = false
let playIconMesh = null
let nowPlayingCanvas = null
let nowPlayingTexture = null
let nowPlayingMesh = null
let activeTrackUri = null
let isTrackPlaying = false

// Drop mode animation state
let dropAnimations = []

// ── Public API ────────────────────────────────────────────

export function updatePlaybackState(trackUri, isPlaying) {
  activeTrackUri = trackUri
  isTrackPlaying = isPlaying
}

export function initScene(canvasId) {
  const canvas = document.getElementById(canvasId)
  if (!canvas) {
    console.error(`[Covify 3D] Canvas #${canvasId} not found`)
    return
  }

  containerEl = canvas.parentElement
  tooltipEl = document.getElementById('track-tooltip')

  // ── Renderer
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(COLORS.surface, 1)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.1

  // ── Scene
  scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(COLORS.surface, 0.015)

  // ── Camera
  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500)
  camera.position.set(0, 0, 18)

  // ── Controls
  controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.06
  controls.rotateSpeed = 0.5
  controls.zoomSpeed = 0.8
  controls.minDistance = 5
  controls.maxDistance = 40
  controls.enablePan = false
  controls.autoRotate = true
  controls.autoRotateSpeed = 0.3

  // ── Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.6)
  scene.add(ambient)

  const key = new THREE.DirectionalLight(0xffffff, 0.8)
  key.position.set(5, 8, 10)
  scene.add(key)

  // Accent rim light (magenta)
  const rim = new THREE.PointLight(COLORS.accent, 0.4, 60)
  rim.position.set(-8, -4, 6)
  scene.add(rim)

  // ── Subtle starfield backdrop
  createStarfield()

  // ── Raycaster
  raycaster = new THREE.Raycaster()
  mouse = new THREE.Vector2(-999, -999)

  // ── Play Icon Mesh
  const playTex = createPlayIconTexture()
  const playMat = new THREE.MeshBasicMaterial({ map: playTex, transparent: true, depthTest: false })
  playIconMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), playMat)
  playIconMesh.visible = false
  scene.add(playIconMesh)

  // ── Now Playing Equalizer Mesh
  createNowPlayingMesh()

  // ── Events
  canvas.addEventListener('mousemove', onMouseMove)
  canvas.addEventListener('click', onClick)
  canvas.addEventListener('mouseleave', () => {
    mouse.set(-999, -999)
    hideTooltip()
  })
  window.addEventListener('resize', onResize)


  // Listen for close enlarged view
  window.addEventListener('covify-close-enlarged', () => {
    closeEnlargedView()
  })

  // Keyboard controls
  window.addEventListener('keydown', onKeyDown)

  onResize()
  animate()
}

function onKeyDown(event) {
  // Ignore shortcuts if user is focusing an input (if any added later)
  if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return

  switch (event.key) {
    case ' ':
      event.preventDefault()
      // Toggle play/pause
      window.dispatchEvent(new CustomEvent('covify-key-toggle-play'))
      break
    case 'ArrowLeft':
      event.preventDefault()
      // Previous track
      window.dispatchEvent(new CustomEvent('covify-key-prev'))
      break
    case 'ArrowRight':
      event.preventDefault()
      // Next track
      window.dispatchEvent(new CustomEvent('covify-key-next'))
      break
    case 'Escape':
      event.preventDefault()
      if (isEnlargedView) {
        closeEnlargedView()
      }
      break
    case 'm':
    case 'M':
      event.preventDefault()
      const nextMode = currentMode === MODE.SPHERE ? MODE.DROP : MODE.SPHERE
      switchMode(nextMode)
      break
  }
}

export function switchMode(mode) {
  if (mode === currentMode) return
  currentMode = mode

  if (mode === MODE.SPHERE) {
    arrangeAsSphere()
  } else if (mode === MODE.DROP) {
    arrangeAsDrop()
  }

  // Dispatch event so UI can update
  window.dispatchEvent(new CustomEvent('covify-mode-changed', { detail: mode }))
}

export function getCurrentMode() {
  return currentMode
}

export function destroyScene() {
  if (animationId) cancelAnimationFrame(animationId)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('keydown', onKeyDown)
  clearScene()
  if (renderer) renderer.dispose()
  if (controls) controls.dispose()
}

/**
 * Public API: build/rebuild the sphere from a track list.
 * Called directly from main.js after scene is confirmed ready.
 */
export function buildSphereFromTracks(tracks, artScale = 1) {
  if (!renderer) {
    console.warn('[Covify 3D] buildSphereFromTracks called before scene was initialized')
    return
  }
  buildScene(tracks, artScale)
}

// ── Scene Building ────────────────────────────────────────

async function buildScene(tracks, artScale = 1) {
  clearScene()

  if (!tracks || tracks.length === 0) return

  const textureLoader = new THREE.TextureLoader()
  textureLoader.crossOrigin = 'anonymous'

  // Deduplicate by album image to avoid loading same texture multiple times
  const uniqueImages = new Map()
  tracks.forEach(t => {
    if (t.imageUrl && !uniqueImages.has(t.imageUrl)) {
      uniqueImages.set(t.imageUrl, null) // placeholder
    }
  })

  // Load textures in staggered batches (chunk size 12)
  const batchSize = 12
  const urls = Array.from(uniqueImages.keys())
  
  for (let i = 0; i < urls.length; i += batchSize) {
    const batchUrls = urls.slice(i, i + batchSize)
    const batchPromises = batchUrls.map(url => {
      return new Promise((resolve) => {
        textureLoader.load(
          url,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace
            tex.minFilter = THREE.LinearMipMapLinearFilter
            tex.magFilter = THREE.LinearFilter
            tex.generateMipmaps = true
            uniqueImages.set(url, tex)
            resolve()
          },
          undefined,
          () => {
            uniqueImages.set(url, createFallbackTexture())
            resolve()
          }
        )
      })
    })
    
    await Promise.all(batchPromises)
    // Yield execution to keep main thread highly responsive
    if (i + batchSize < urls.length) {
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }

  createArtMeshes(tracks, uniqueImages, artScale)

  if (currentMode === MODE.SPHERE) {
    arrangeAsSphere(true)
  } else {
    arrangeAsDrop(true)
  }
}

function createArtMeshes(tracks, textureMap, artScale = 1) {
  const artSize = calculateArtSize(tracks.length) * artScale

  tracks.forEach((track, i) => {
    const tex = textureMap.get(track.imageUrl) || createFallbackTexture()

    const geometry = new THREE.PlaneGeometry(artSize, artSize)

    const material = new THREE.MeshStandardMaterial({
      map: tex,
      side: THREE.DoubleSide,
      roughness: 0.4,
      metalness: 0.05,
      transparent: true,
      opacity: 0,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0,
    })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.userData = { track, index: i, artSize }

    scene.add(mesh)
    artMeshes.push(mesh)
    trackDataMap.set(mesh.uuid, track)
  })
}

// ── Golden Angle Sphere Layout ────────────────────────────

function arrangeAsSphere(animated = true) {
  const n = artMeshes.length
  if (n === 0) return

  // Sphere radius scales with count
  const radius = Math.max(5, Math.cbrt(n) * 1.8)

  artMeshes.forEach((mesh, i) => {
    // Golden angle distribution on sphere surface
    const y = 1 - (2 * i) / (n - 1 || 1) // -1 to 1
    const radiusAtY = Math.sqrt(1 - y * y)
    const theta = GOLDEN_ANGLE * i

    const targetPos = new THREE.Vector3(
      radiusAtY * Math.cos(theta) * radius,
      y * radius,
      radiusAtY * Math.sin(theta) * radius,
    )

    if (animated) {
      animateMeshTo(mesh, targetPos, i * 15, 1.0)
    } else {
      mesh.position.copy(targetPos)
      mesh.material.opacity = 1.0
    }

    // Billboard: face camera (will be updated in animate loop)
    mesh.lookAt(0, 0, 0)
  })

  // Reset camera for sphere view
  if (animated) {
    smoothCameraMove(new THREE.Vector3(0, 0, radius * 2.2))
  }

  controls.autoRotate = true
  controls.autoRotateSpeed = 0.3
}

// ── Drop / Cascade Layout ─────────────────────────────────

function arrangeAsDrop(animated = true) {
  const n = artMeshes.length
  if (n === 0) return

  dropAnimations = []

  // Grid-like spread with random vertical offsets
  const cols = Math.ceil(Math.sqrt(n))
  const spacing = 2.2
  const spreadX = (cols - 1) * spacing * 0.5

  artMeshes.forEach((mesh, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)

    const x = col * spacing - spreadX + (Math.random() - 0.5) * 0.6
    const z = row * spacing - spreadX + (Math.random() - 0.5) * 0.6
    const yTarget = (Math.random() - 0.5) * 2

    // Start high above
    const yStart = 30 + Math.random() * 20

    if (animated) {
      mesh.position.set(x, yStart, z)
      mesh.material.opacity = 0

      dropAnimations.push({
        mesh,
        startY: yStart,
        targetY: yTarget,
        targetX: x,
        targetZ: z,
        delay: i * 30 + Math.random() * 200,
        startTime: performance.now(),
        duration: 1500 + Math.random() * 800,
        bouncePhase: 0,
        settled: false,
      })
    } else {
      mesh.position.set(x, yTarget, z)
      mesh.material.opacity = 1.0
    }

    // Face forward in drop mode
    mesh.rotation.set(0, 0, 0)
  })

  // Camera for drop view: pull back and up
  if (animated) {
    smoothCameraMove(new THREE.Vector3(0, 8, cols * 1.8))
  }

  controls.autoRotate = false
}

// ── Animation Helpers ─────────────────────────────────────

function animateMeshTo(mesh, targetPos, delayMs, targetOpacity) {
  const startPos = mesh.position.clone()
  const startOpacity = mesh.material.opacity
  const startTime = performance.now() + delayMs
  const duration = 800

  function update() {
    const now = performance.now()
    if (now < startTime) {
      requestAnimationFrame(update)
      return
    }
    const elapsed = now - startTime
    const t = Math.min(1, elapsed / duration)
    // Easing: cubic-bezier approximation (easing.spring from DESIGN.md)
    const ease = 1 - Math.pow(1 - t, 3)

    mesh.position.lerpVectors(startPos, targetPos, ease)
    mesh.material.opacity = startOpacity + (targetOpacity - startOpacity) * ease

    if (t < 1) requestAnimationFrame(update)
  }
  requestAnimationFrame(update)
}

function smoothCameraMove(targetPos) {
  const startPos = camera.position.clone()
  const startTime = performance.now()
  const duration = 1200

  function update() {
    const elapsed = performance.now() - startTime
    const t = Math.min(1, elapsed / duration)
    const ease = 1 - Math.pow(1 - t, 3)

    camera.position.lerpVectors(startPos, targetPos, ease)

    if (t < 1) requestAnimationFrame(update)
  }
  requestAnimationFrame(update)
}

// ── Drop Mode Physics ─────────────────────────────────────

function updateDropAnimations() {
  const now = performance.now()

  dropAnimations.forEach((anim) => {
    if (anim.settled) return

    const elapsed = now - anim.startTime - anim.delay
    if (elapsed < 0) return

    const t = Math.min(1, elapsed / anim.duration)

    // Easing with bounce at the end
    let ease
    if (t < 0.6) {
      ease = t / 0.6
      ease = ease * ease // accelerate (gravity)
    } else {
      const bounceT = (t - 0.6) / 0.4
      // Damped bounce
      const bounce = Math.sin(bounceT * Math.PI * 2.5) * Math.exp(-bounceT * 4) * 0.3
      ease = 1 + bounce
    }

    const y = anim.startY + (anim.targetY - anim.startY) * Math.min(ease, 1.3)
    anim.mesh.position.y = y
    anim.mesh.position.x = anim.targetX
    anim.mesh.position.z = anim.targetZ

    // Fade in during first 30%
    anim.mesh.material.opacity = Math.min(1, t / 0.3)

    // Gentle tumble rotation while falling
    if (t < 0.8) {
      anim.mesh.rotation.x = (1 - t) * 0.3
      anim.mesh.rotation.z = Math.sin(elapsed * 0.002) * 0.1
    } else {
      // Settle to flat
      anim.mesh.rotation.x *= 0.95
      anim.mesh.rotation.z *= 0.95
    }

    if (t >= 1) {
      anim.settled = true
      anim.mesh.position.y = anim.targetY
      anim.mesh.rotation.set(0, 0, 0)
    }
  })
}

// ── Starfield ─────────────────────────────────────────────

function createStarfield() {
  const count = 600
  const positions = new Float32Array(count * 3)
  const sizes = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 200
    positions[i * 3 + 1] = (Math.random() - 0.5) * 200
    positions[i * 3 + 2] = (Math.random() - 0.5) * 200
    sizes[i] = Math.random() * 1.5 + 0.3
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))

  const material = new THREE.PointsMaterial({
    color: COLORS.bone,
    size: 0.15,
    transparent: true,
    opacity: 0.35,
    sizeAttenuation: true,
    depthWrite: false,
  })

  const stars = new THREE.Points(geometry, material)
  stars.userData.isStar = true
  scene.add(stars)
}

// ── Interaction ───────────────────────────────────────────

function onMouseMove(event) {
  const rect = renderer.domElement.getBoundingClientRect()
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
}

function onClick(event) {
  if (isEnlargedView) return

  raycaster.setFromCamera(mouse, camera)
  
  // Check play button hit first
  const playHits = playIconMesh && playIconMesh.visible ? raycaster.intersectObject(playIconMesh) : []
  
  if (playHits.length > 0) {
    const track = playIconMesh.userData.track
    if (track) {
      window.dispatchEvent(new CustomEvent('covify-track-clicked', { detail: track }))
      if (playIconMesh.userData.parentMesh) {
        pulseAccentGlow(playIconMesh.userData.parentMesh)
      }
    }
    return
  }

  // Otherwise check album art
  const hits = raycaster.intersectObjects(artMeshes)

  if (hits.length > 0) {
    const mesh = hits[0].object
    const track = mesh.userData.track

    if (track) {
      // User only wants music to play when button is clicked. 
      // Click on album art opens enlarged view.
      openEnlargedView(mesh, track)
    }
  }
}

function pulseAccentGlow(mesh) {
  const origEmissive = mesh.material.emissive.clone()
  mesh.material.emissive.set(COLORS.accent)
  mesh.material.emissiveIntensity = 0.6

  const startTime = performance.now()
  function decay() {
    const t = (performance.now() - startTime) / 600
    if (t >= 1) {
      mesh.material.emissive.copy(origEmissive)
      mesh.material.emissiveIntensity = 0
      return
    }
    mesh.material.emissiveIntensity = 0.6 * (1 - t)
    requestAnimationFrame(decay)
  }
  requestAnimationFrame(decay)
}

// ── Enlarged Art View ─────────────────────────────────────

function openEnlargedView(mesh, track) {
  isEnlargedView = true
  selectedMesh = mesh
  controls.enabled = false

  // Show the overlay via DOM event
  window.dispatchEvent(new CustomEvent('covify-enlarged-open', {
    detail: {
      track,
      imageUrl: track.imageUrl,
    },
  }))
}

function closeEnlargedView() {
  isEnlargedView = false
  selectedMesh = null
  controls.enabled = true

  window.dispatchEvent(new CustomEvent('covify-enlarged-closed'))
}

// ── Hover Handling (in animate loop) ──────────────────────

function handleHover() {
  if (isEnlargedView) return

  raycaster.setFromCamera(mouse, camera)
  const playHits = playIconMesh && playIconMesh.visible ? raycaster.intersectObject(playIconMesh) : []
  const hits = raycaster.intersectObjects(artMeshes)

  if (playHits.length > 0) {
    renderer.domElement.style.cursor = 'pointer'
    return
  }

  if (hits.length > 0) {
    const mesh = hits[0].object
    const track = mesh.userData.track

    if (hoveredMesh !== mesh) {
      // Reset previous hover
      if (hoveredMesh) {
        hoveredMesh.material.emissiveIntensity = 0
        hoveredMesh.scale.set(1, 1, 1)
      }

      // Apply hover with big scale
      hoveredMesh = mesh
      mesh.material.emissive.set(COLORS.accent)
      mesh.material.emissiveIntensity = 0.04
      mesh.scale.set(1.4, 1.4, 1) // BIG SCALE as requested

      if (playIconMesh) {
        playIconMesh.visible = true
        playIconMesh.userData.track = track
        playIconMesh.userData.parentMesh = mesh
      }
    }

    renderer.domElement.style.cursor = 'default'

    // Update tooltip position
    if (track && tooltipEl) {
      const screenPos = getScreenPosition(mesh)
      tooltipEl.style.left = `${screenPos.x}px`
      tooltipEl.style.top = `${screenPos.y}px`
      tooltipEl.classList.remove('hidden')
      document.getElementById('tooltip-name').textContent = track.name
      document.getElementById('tooltip-artists').textContent = track.artists
    }
  } else {
    if (hoveredMesh) {
      hoveredMesh.material.emissiveIntensity = 0
      hoveredMesh.scale.set(1, 1, 1)
      hoveredMesh = null
    }
    if (playIconMesh) playIconMesh.visible = false
    hideTooltip()
    renderer.domElement.style.cursor = 'default'
  }
}

function getScreenPosition(mesh) {
  const vec = new THREE.Vector3()
  mesh.getWorldPosition(vec)
  vec.project(camera)

  const rect = renderer.domElement.getBoundingClientRect()
  return {
    x: (vec.x * 0.5 + 0.5) * rect.width + rect.left,
    y: (-vec.y * 0.5 + 0.5) * rect.height + rect.top,
  }
}

function hideTooltip() {
  if (tooltipEl) tooltipEl.classList.add('hidden')
}

// ── Utility ───────────────────────────────────────────────

function calculateArtSize(count) {
  // Scale art size inversely with count, with a floor and ceiling
  if (count <= 10) return 2.0
  if (count <= 30) return 1.6
  if (count <= 80) return 1.3
  if (count <= 150) return 1.1
  return 0.9
}

function createFallbackTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')

  // Neutral card background
  ctx.fillStyle = '#181818'
  ctx.fillRect(0, 0, 128, 128)

  // Music note icon
  ctx.fillStyle = '#b3b3b3'
  ctx.font = '48px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('♫', 64, 64)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function createPlayIconTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')

  // Semi-transparent circular background
  ctx.fillStyle = '#1ed760' // Spotify Green
  ctx.beginPath()
  ctx.arc(128, 128, 100, 0, Math.PI * 2)
  ctx.fill()

  // Black play triangle
  ctx.fillStyle = '#000000'
  ctx.font = 'bold 90px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('▶', 135, 128)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function createNowPlayingMesh() {
  nowPlayingCanvas = document.createElement('canvas')
  nowPlayingCanvas.width = 128
  nowPlayingCanvas.height = 128
  
  nowPlayingTexture = new THREE.CanvasTexture(nowPlayingCanvas)
  nowPlayingTexture.colorSpace = THREE.SRGBColorSpace
  
  const material = new THREE.MeshBasicMaterial({
    map: nowPlayingTexture,
    transparent: true,
    depthTest: true,
    depthWrite: false
  })
  
  nowPlayingMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
  nowPlayingMesh.visible = false
  scene.add(nowPlayingMesh)
}

function drawEqualizer(isPlaying) {
  if (!nowPlayingCanvas) return
  const ctx = nowPlayingCanvas.getContext('2d')
  ctx.clearRect(0, 0, 128, 128)
  
  // Dark semi-transparent overlay
  ctx.fillStyle = 'rgba(18, 18, 18, 0.65)'
  ctx.fillRect(0, 0, 128, 128)
  
  // Glowing green equalizer bars
  const barWidth = 10
  const gap = 6
  const startX = 35
  const time = performance.now() * 0.012
  
  for (let i = 0; i < 4; i++) {
    let height = 12 // Min height
    if (isPlaying) {
      height = 12 + Math.abs(Math.sin(time + i * 1.6)) * 60 + Math.random() * 8
    }
    const x = startX + i * (barWidth + gap)
    const y = 128 - 25 - height
    
    ctx.fillStyle = '#1ed760' // Spotify Green
    ctx.beginPath()
    if (ctx.roundRect) {
      ctx.roundRect(x, y, barWidth, height, 3)
    } else {
      ctx.rect(x, y, barWidth, height)
    }
    ctx.fill()
  }
}

function clearScene() {
  artMeshes.forEach(m => {
    m.geometry.dispose()
    m.material.dispose()
    if (m.material.map) m.material.map.dispose()
    scene.remove(m)
  })
  artMeshes = []
  trackDataMap.clear()
  dropAnimations = []
  hoveredMesh = null
  selectedMesh = null
  isEnlargedView = false
}

function onResize() {
  if (!containerEl || !renderer || !camera) return
  const w = containerEl.clientWidth
  const h = containerEl.clientHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
}

// ── Animate Loop ──────────────────────────────────────────

function animate() {
  animationId = requestAnimationFrame(animate)

  // Billboard in sphere mode: each art faces camera
  if (currentMode === MODE.SPHERE) {
    artMeshes.forEach(mesh => {
      mesh.lookAt(camera.position)
    })
  }

  // Drop physics
  if (currentMode === MODE.DROP) {
    updateDropAnimations()
    // Gentle float for settled items
    const time = performance.now() * 0.001
    artMeshes.forEach((mesh, i) => {
      if (dropAnimations[i]?.settled) {
        mesh.position.y = dropAnimations[i].targetY + Math.sin(time + i * 0.5) * 0.08
      }
    })
  }

  handleHover()

  if (playIconMesh && playIconMesh.visible && hoveredMesh) {
    // Attach play icon to hovered mesh position
    playIconMesh.position.copy(hoveredMesh.position)
    playIconMesh.rotation.copy(hoveredMesh.rotation)
    playIconMesh.translateZ(0.1) // Push slightly forward

    const artSize = hoveredMesh.userData.artSize * hoveredMesh.scale.x
    playIconMesh.scale.set(artSize * 0.4, artSize * 0.4, 1)
  }

  // Now Playing Equalizer Overlay update
  let playingMesh = null
  if (activeTrackUri && artMeshes.length > 0) {
    playingMesh = artMeshes.find(m => m.userData.track?.uri === activeTrackUri)
  }

  if (playingMesh && nowPlayingMesh) {
    nowPlayingMesh.visible = true
    nowPlayingMesh.position.copy(playingMesh.position)
    nowPlayingMesh.rotation.copy(playingMesh.rotation)
    nowPlayingMesh.translateZ(0.015) // Slightly in front of the album art mesh

    const artSize = playingMesh.userData.artSize * playingMesh.scale.x
    nowPlayingMesh.scale.set(artSize, artSize, 1)

    drawEqualizer(isTrackPlaying)
    nowPlayingTexture.needsUpdate = true
  } else if (nowPlayingMesh) {
    nowPlayingMesh.visible = false
  }

  controls.update()
  renderer.render(scene, camera)
}
