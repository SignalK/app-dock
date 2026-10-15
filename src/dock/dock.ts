import type { DockPosition, IframeMode } from '../plugin/schema'

// An app on the dock: an entry of the plugin's /settings, or of the saved
// configuration when /settings has none.
interface DockApp {
  url: string
  label: string
  icon?: string | null
  color?: string | null
  autostart?: boolean
  enabled?: boolean
}

interface DockConfig {
  position: DockPosition
  iframeMode: IframeMode
  iconSize: number
  magnification: boolean
  magnificationScale: number
  showNightModeButton: boolean
  showFullscreenButton: boolean
  showExitButton: boolean
  tourDismissed?: boolean
  apps: DockApp[]
}

interface LoginStatus {
  authenticationRequired?: boolean
  status?: string
  userLevel?: string
}

// A pointerdown forwarded by a page on another origin (see "Apps on another
// origin" below).
interface ForwardedPointerdown {
  type?: unknown
  x?: unknown
  y?: unknown
  t?: unknown
}

interface Point {
  x: number
  y: number
}

// Coordinates are in the dock's viewport unless a tap names another space:
// the window of the frame that forwarded it.
type TapSpace = MessageEventSource | null

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id)
  if (!el) throw new Error(`[Dock] #${id} is missing from index.html`)
  return el as T
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

;(async function DockApp() {
  // Bail out if we're running inside another iframe. This prevents the
  // dock-in-dock loop when the dock is opened via its own Settings tile /
  // the admin UI's Webapps tab / any other embed path. Same-origin redirect
  // the top window to the dock URL so the user ends up on a clean
  // standalone dock instead of a nested instance. The outer dock grants
  // allow-top-navigation-by-user-activation in its iframe sandbox, so this
  // works as long as the user activated the nested load by tapping.
  if (window.self !== window.top) {
    const dockUrl = window.location.href
    try {
      window.top?.location.replace(dockUrl)
    } catch {
      // Cross-origin parent or missing top-nav sandbox permission.
    }
    // If replace() was blocked, top-nav sandbox permission was missing AND
    // the user hadn't tapped recently. Show a tappable escape hatch — the
    // click is itself a user activation, so the link succeeds even when
    // only allow-top-navigation-by-user-activation is present.
    document.body.innerHTML =
      '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;height:100vh;color:#fff;background:#000;font-family:-apple-system,BlinkMacSystemFont,sans-serif;text-align:center;padding:16px">' +
      '<img src="app-icon.svg" alt="App Dock" style="width:72px;height:72px;border-radius:16px;opacity:0.85" />' +
      '<a href="' +
      dockUrl +
      '" target="_top" style="color:#fff;text-decoration:underline;font-size:16px">Open App Dock</a>' +
      '</div>'
    return
  }

  const DEFAULTS: DockConfig = {
    position: 'bottom',
    iframeMode: 'keep-alive',
    iconSize: 56,
    magnification: true,
    magnificationScale: 1.7,
    showNightModeButton: true,
    showFullscreenButton: false,
    showExitButton: false,
    apps: []
  }

  // Fallback app list for a visitor who is not an admin when the plugin's
  // /settings refuses them. signalk-server before 2.31 keeps every plugin
  // route admin-only, and any version refuses a visitor who is not signed in
  // unless it allows read-only access. Mirrors the server-side DEFAULT_APPS
  // in plugin/index.js so the demo at demo.signalk.org behaves sensibly for
  // non-admin visitors.
  const NO_ADMIN_DEFAULTS: Partial<DockConfig> = {
    showNightModeButton: true,
    apps: [
      {
        enabled: true,
        autostart: true,
        url: '/@signalk/freeboard-sk/',
        label: 'Freeboard-SK',
        icon: '/@signalk/freeboard-sk/assets/icons/icon-72x72.png',
        color: ''
      },
      {
        enabled: true,
        autostart: false,
        url: '/@halos-org/skip/',
        label: 'Skip',
        icon: '/@halos-org/skip/assets/icon-72x72.png',
        color: ''
      },
      {
        enabled: true,
        autostart: false,
        url: '/admin/',
        label: 'Settings',
        icon: '/@signalk/app-dock/icon-settings.svg',
        color: '#78788c'
      }
    ]
  }

  // ─── Detect access level ────────────────────────────────────────────────────
  // /skServer/loginStatus is public. Only an admin can read the plugin's
  // /config (signalk-server keeps it admin-only), so every other visitor has
  // noAdminAccess and reads the dock from /settings instead. canWrite marks
  // the users signalk-server lets write: admins and readwrite users.
  // When authenticationRequired is false (no-auth / dummy-security setups),
  // /plugins/* is reachable without a login, so treat the visitor as
  // full-access instead of falling through to the hardcoded fallback list.
  // Try /skServer/loginStatus first, fall back to the legacy /loginStatus.
  let noAdminAccess = false
  let canWrite = true
  for (const url of ['/skServer/loginStatus', '/loginStatus']) {
    try {
      const res = await fetch(url)
      if (res.ok) {
        const data: LoginStatus = await res.json()
        const authOff = data.authenticationRequired === false
        const level = data.status === 'loggedIn' ? data.userLevel : undefined
        noAdminAccess = !authOff && level !== 'admin'
        canWrite = authOff || level === 'admin' || level === 'readwrite'
        break
      }
    } catch {
      // try next URL
    }
  }

  // The dock as the plugin serves it on /settings: the plugin configuration
  // with the enabled apps resolved. The plugin opens this route to every user
  // with read access on signalk-server 2.31 and later. Null when the route
  // refuses this visitor or answers without an app list.
  async function fetchSharedConfig(): Promise<DockConfig | null> {
    try {
      const res = await fetch('/plugins/signalk-app-dock/settings')
      if (!res.ok) return null
      const data = await res.json()
      return Array.isArray(data.apps) ? { ...DEFAULTS, ...data } : null
    } catch {
      return null
    }
  }

  // ─── Load config from plugin endpoints ───────────────────────────────────────
  let cfg: DockConfig = { ...DEFAULTS }
  // Whether the dock keeps calling the plugin's routes after loading: always
  // for an admin, and for anyone else once /settings has served them the dock
  // (the plugin opens /settings and /mode to the same users).
  let pluginReachable = !noAdminAccess
  if (noAdminAccess) {
    const shared = await fetchSharedConfig()
    pluginReachable = shared !== null
    cfg = shared || { ...DEFAULTS, ...NO_ADMIN_DEFAULTS }
  } else {
    try {
      const [configRes, settingsRes] = await Promise.all([
        fetch('/plugins/signalk-app-dock/config'),
        fetch('/plugins/signalk-app-dock/settings')
      ])
      if (configRes.ok) {
        const data = await configRes.json()
        const pluginCfg: Partial<DockConfig> = data.configuration || data
        cfg = { ...DEFAULTS, ...pluginCfg }
      }
      if (settingsRes.ok) {
        const data = await settingsRes.json()
        if (Array.isArray(data.apps) && data.apps.length > 0) {
          cfg.apps = data.apps
        }
      }
    } catch (e) {
      console.warn('[Dock] Could not load config, using defaults.', e)
    }
  }

  if (!Array.isArray(cfg.apps) || cfg.apps.length === 0) {
    console.warn('[Dock] No apps configured — open Plugin Config to add webapps.')
  }

  // ─── DOM refs ────────────────────────────────────────────────────────────────
  const $iframeContainer = byId('iframe-container')
  const $backdrop = byId('dock-backdrop')
  const $dock = byId('dock')
  const $dockInner = byId('dock-inner')
  const $loadingOverlay = byId('loading-overlay')
  const $loadingLabel = byId('loading-label')
  const $idleHint = document.getElementById('idle-hint')
  const $idleHintText = byId('idle-hint-text')
  const $dockHandle = byId('dock-handle')

  // ─── State ───────────────────────────────────────────────────────────────────
  let dockVisible = false
  const iframes: Record<string, HTMLIFrameElement> = {}

  // ─── Night mode state ────────────────────────────────────────────────────────
  let currentMode = 'day'
  // The button reads the mode from the plugin's /mode and switches it with a
  // PUT that signalk-server accepts from admins and readwrite users only, so
  // only visitors who can do both get the button.
  const nightModeUsable = pluginReachable && canWrite

  async function fetchCurrentMode() {
    if (!pluginReachable) return
    try {
      const res = await fetch('/plugins/signalk-app-dock/mode')
      if (res.ok) {
        const data: { value?: string } = await res.json()
        currentMode = data.value || 'day'
        updateNightModeIcon()
      }
    } catch (e) {
      console.warn('[Dock] Could not fetch environment.mode', e)
    }
  }

  function updateNightModeIcon() {
    const icon = document.querySelector('.dock-item-nightmode .dock-icon')
    if (!icon) return
    icon.textContent = currentMode === 'night' ? '\u{1F319}' : '\u2600\uFE0F'
    const label = document.querySelector('.dock-item-nightmode .dock-label')
    if (label) label.textContent = currentMode === 'night' ? 'Day mode' : 'Night mode'
  }

  async function toggleNightMode() {
    if (!nightModeUsable) return
    await fetchCurrentMode()
    const newMode = currentMode === 'night' ? 'day' : 'night'
    try {
      const res = await fetch('/signalk/v1/api/vessels/self/environment/mode', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: newMode })
      })
      if (res.ok) {
        currentMode = newMode
        updateNightModeIcon()
      }
    } catch (e) {
      console.warn('[Dock] Failed to toggle mode', e)
    }
  }

  // ─── Fullscreen toggle ───────────────────────────────────────────────────────
  // Targets documentElement so the iframe (a descendant) goes fullscreen with
  // the dock. Targeting body or the iframe directly would either fail or make
  // the iframe the fullscreen element, which breaks gesture passthrough.
  function fullscreenSupported() {
    return !!(document.fullscreenEnabled && document.documentElement.requestFullscreen)
  }

  function isFullscreen() {
    return !!document.fullscreenElement
  }

  function toggleFullscreen() {
    if (!fullscreenSupported()) return
    if (isFullscreen()) {
      document.exitFullscreen().catch((e) => console.warn('[Dock] exitFullscreen', e))
    } else {
      document.documentElement.requestFullscreen().catch((e) => console.warn('[Dock] requestFullscreen', e))
    }
  }

  function updateFullscreenIcon() {
    const icon = document.querySelector('.dock-item-fullscreen .dock-icon')
    if (!icon) return
    icon.textContent = isFullscreen() ? '\u2922' : '\u26F6'
    const label = document.querySelector('.dock-item-fullscreen .dock-label')
    if (label) label.textContent = isFullscreen() ? 'Exit fullscreen' : 'Fullscreen'
  }

  // ─── Apply dock position class & alignment ───────────────────────────────────
  const pos = cfg.position
  $dock.classList.add(`pos-${pos}`)
  $dockInner.classList.add(`align-${pos}`)
  $dockHandle.classList.add(`pos-${pos}`)

  const isVertical = pos === 'left' || pos === 'right'
  if (isVertical) $dockInner.classList.add('layout-vertical')

  // ─── Magnification constants ─────────────────────────────────────────────────
  const MAG_ENABLED = cfg.magnification !== false
  const MAG_SCALE = Math.max(1, Math.min(cfg.magnificationScale || 1.7, 2.5))
  const MAG_RADIUS = cfg.iconSize * 3.5

  // ─── Welcome screen ──────────────────────────────────────────────────────────
  function setIdleHint() {
    const $version = document.getElementById('idle-version')
    if ($version) {
      fetch('/skServer/webapps')
        .then((r) => r.json())
        .then((apps: { name: string; version: string }[]) => {
          const me = apps.find((a) => a.name === '@signalk/app-dock')
          if (me) $version.textContent = 'v' + me.version
        })
        .catch(() => {})
    }

    if (!cfg.apps || cfg.apps.length === 0) {
      if (noAdminAccess) {
        $idleHintText.innerHTML =
          'App Dock can only be customised by an administrator.<br>' +
          'Ask an admin to set up apps in <strong>Plugin Config</strong>.'
      } else {
        $idleHintText.innerHTML =
          'No apps configured yet.<br>' +
          'Open <strong>Admin UI \u2192 Plugin Config \u2192 App Dock</strong><br>' +
          'and click <strong>Discover Installed Webapps</strong> to get started.'
      }
      return
    }

    const footer = noAdminAccess
      ? '<br><br><span style="font-size:12px;opacity:0.6">Customisation is admin-only</span>'
      : '<br><br><span style="font-size:12px;opacity:0.6">Configure in Admin UI \u2192 Plugin Config \u2192 App Dock</span>'
    $idleHintText.innerHTML = 'Double-tap <strong>anywhere</strong> to open the dock' + footer
  }

  function hideIdleHint() {
    if ($idleHint) $idleHint.classList.add('hidden')
  }

  // ─── Tooltip direction based on dock edge ────────────────────────────────────
  function labelClass() {
    switch (pos) {
      case 'top':
        return 'dock-label-below'
      case 'left':
        return 'dock-label-right'
      case 'right':
        return 'dock-label-left'
      default:
        return ''
    }
  }

  // ─── Utility item builder ─────────────────────────────────────────────────────
  function createUtilityItem(className: string, icon: string, label: string, onClick: () => void) {
    const sz = cfg.iconSize
    const radius = Math.round(sz * 0.25) + 'px'
    const lblCls = labelClass()

    const $item = document.createElement('div')
    $item.className = 'dock-item dock-item-utility ' + className

    const $icon = document.createElement('div')
    $icon.className = 'dock-icon dock-icon-utility'
    $icon.style.width = sz + 'px'
    $icon.style.height = sz + 'px'
    $icon.style.borderRadius = radius
    $icon.style.fontSize = Math.round(sz * 0.48) + 'px'
    $icon.textContent = icon

    const $dot = document.createElement('div')
    $dot.className = 'dock-dot'

    const $label = document.createElement('div')
    $label.className = 'dock-label' + (lblCls ? ' ' + lblCls : '')
    $label.textContent = label

    $item.appendChild($icon)
    $item.appendChild($dot)
    $item.appendChild($label)

    $item.addEventListener('touchstart', () => $item.classList.add('pressing'), { passive: true })
    $item.addEventListener('touchend', () => $item.classList.remove('pressing'), { passive: true })
    $item.addEventListener('touchcancel', () => $item.classList.remove('pressing'), { passive: true })

    $item.addEventListener('click', (e) => {
      if (magScrubbed) {
        e.preventDefault()
        return
      }
      onClick()
    })

    return $item
  }

  function createSeparator() {
    const $sep = document.createElement('div')
    $sep.className = 'dock-separator'
    return $sep
  }

  // ─── Build dock items ─────────────────────────────────────────────────────────
  function buildDock() {
    $dockInner.innerHTML = ''
    const sz = cfg.iconSize
    const radius = Math.round(sz * 0.25) + 'px'
    const lblCls = labelClass()

    const showNightMode = cfg.showNightModeButton && nightModeUsable
    if (showNightMode) {
      $dockInner.appendChild(
        createUtilityItem('dock-item-nightmode', '\u2600\uFE0F', 'Night mode', () => void toggleNightMode())
      )
    }

    if (cfg.showFullscreenButton && fullscreenSupported()) {
      $dockInner.appendChild(createUtilityItem('dock-item-fullscreen', '\u26F6', 'Fullscreen', toggleFullscreen))
    }

    if (showNightMode || (cfg.showFullscreenButton && fullscreenSupported())) {
      $dockInner.appendChild(createSeparator())
    }

    cfg.apps.forEach((app, i) => {
      const $item = document.createElement('div')
      $item.className = 'dock-item'
      $item.dataset.index = String(i)

      const $icon = document.createElement('div')
      $icon.className = 'dock-icon'
      $icon.style.width = sz + 'px'
      $icon.style.height = sz + 'px'
      $icon.style.borderRadius = radius
      if (app.color) $icon.style.background = app.color

      const iconVal = app.icon || ''
      if (iconVal.startsWith('/') || iconVal.startsWith('http')) {
        const $img = document.createElement('img')
        $img.src = iconVal
        $img.alt = app.label
        $img.onerror = () => {
          $icon.removeChild($img)
          $icon.style.fontSize = Math.round(sz * 0.42) + 'px'
          $icon.textContent = app.label.slice(0, 2).toUpperCase()
        }
        $icon.appendChild($img)
      } else {
        $icon.style.fontSize = Math.round(sz * 0.48) + 'px'
        $icon.textContent = iconVal || app.label.slice(0, 2).toUpperCase()
      }

      const $dot = document.createElement('div')
      $dot.className = 'dock-dot'

      const $label = document.createElement('div')
      $label.className = 'dock-label' + (lblCls ? ' ' + lblCls : '')
      $label.textContent = app.label

      $item.appendChild($icon)
      $item.appendChild($dot)
      $item.appendChild($label)

      $item.addEventListener('touchstart', () => $item.classList.add('pressing'), { passive: true })
      $item.addEventListener('touchend', () => $item.classList.remove('pressing'), { passive: true })
      $item.addEventListener('touchcancel', () => $item.classList.remove('pressing'), { passive: true })

      $item.addEventListener('click', (e) => {
        if (magScrubbed) {
          e.preventDefault()
          return
        }
        switchToApp(i)
      })

      $dockInner.appendChild($item)
    })

    if (cfg.showExitButton) {
      $dockInner.appendChild(createSeparator())
      $dockInner.appendChild(
        createUtilityItem('dock-item-exit', '\u2715', 'Exit to Admin', () => {
          window.location.href = '/admin/'
        })
      )
    }

    if (cfg.showNightModeButton) updateNightModeIcon()
    if (cfg.showFullscreenButton && fullscreenSupported()) updateFullscreenIcon()
  }

  // ─── Magnification ───────────────────────────────────────────────────────────
  let magRafPending = false
  let magScrubbed = false
  let magTouchStartAxis = 0

  function applyMagnification(pointerPos: Point) {
    const items = $dockInner.querySelectorAll<HTMLElement>('.dock-item')
    let closestIdx = -1
    let closestDist = Infinity

    items.forEach((item, i) => {
      const icon = item.querySelector<HTMLElement>('.dock-icon')
      if (!icon) return
      const rect = item.getBoundingClientRect()
      const center = isVertical ? rect.top + rect.height / 2 : rect.left + rect.width / 2
      const p = isVertical ? pointerPos.y : pointerPos.x

      const dist = Math.abs(p - center)
      if (dist < closestDist) {
        closestDist = dist
        closestIdx = i
      }

      const ratio = Math.min(dist / MAG_RADIUS, 1)
      const scale = 1 + (MAG_SCALE - 1) * (1 - ratio * ratio)
      const newSize = Math.round(cfg.iconSize * scale)

      icon.classList.remove('settling')
      icon.style.width = newSize + 'px'
      icon.style.height = newSize + 'px'
      icon.style.borderRadius = Math.round(newSize * 0.25) + 'px'

      if (icon.querySelector('img')) {
        // image icons scale via width/height, fontSize not needed
      } else {
        icon.style.fontSize = Math.round(newSize * 0.48) + 'px'
      }
    })

    items.forEach((item, i) => {
      item.classList.toggle('mag-closest', i === closestIdx)
    })
  }

  function resetMagnification() {
    const items = $dockInner.querySelectorAll<HTMLElement>('.dock-item')
    const sz = cfg.iconSize

    items.forEach((item) => {
      const icon = item.querySelector<HTMLElement>('.dock-icon')
      if (!icon) return
      icon.classList.add('settling')
      icon.style.width = sz + 'px'
      icon.style.height = sz + 'px'
      icon.style.borderRadius = Math.round(sz * 0.25) + 'px'

      if (!icon.querySelector('img')) {
        icon.style.fontSize = Math.round(sz * 0.48) + 'px'
      }

      item.classList.remove('mag-closest')
    })
  }

  if (MAG_ENABLED) {
    $dockInner.addEventListener('mousemove', (e) => {
      if (magRafPending) return
      magRafPending = true
      const pos = { x: e.clientX, y: e.clientY }
      requestAnimationFrame(() => {
        applyMagnification(pos)
        magRafPending = false
      })
    })

    $dockInner.addEventListener('mouseleave', () => {
      magRafPending = false
      resetMagnification()
    })

    $dockInner.addEventListener(
      'touchstart',
      (e) => {
        const t = e.touches[0]
        magScrubbed = false
        magTouchStartAxis = isVertical ? t.clientY : t.clientX
      },
      { passive: true }
    )

    $dockInner.addEventListener(
      'touchmove',
      (e) => {
        const t = e.touches[0]
        const current = isVertical ? t.clientY : t.clientX
        if (Math.abs(current - magTouchStartAxis) > 10) {
          magScrubbed = true
        }
        if (magRafPending) return
        magRafPending = true
        const pos = { x: t.clientX, y: t.clientY }
        requestAnimationFrame(() => {
          applyMagnification(pos)
          magRafPending = false
        })
      },
      { passive: true }
    )

    $dockInner.addEventListener(
      'touchend',
      () => {
        magRafPending = false
        resetMagnification()
        setTimeout(() => {
          magScrubbed = false
        }, 50)
      },
      { passive: true }
    )
  }

  // ─── Show / hide dock ────────────────────────────────────────────────────────
  let dockShownAt = 0
  const DOCK_CLICK_IGNORE_MS = 500

  function showDock() {
    if (dockVisible) return
    dockVisible = true
    dockShownAt = Date.now()
    $dock.classList.add('visible')
    $backdrop.classList.add('visible')
    updateHandle()
  }

  function hideDock() {
    if (!dockVisible) return
    if ($tourOverlay && $tourOverlay.classList.contains('visible')) return
    dockVisible = false
    $dock.classList.remove('visible')
    $backdrop.classList.remove('visible')
    resetMagnification()
    updateHandle()
  }

  $backdrop.addEventListener('click', (e) => {
    // Windows touch synthesizes a click on whatever's under the finger after
    // pointerdown. If that click lands on the just-shown backdrop, it would
    // immediately close the dock. Ignore clicks within a short window after
    // the dock opens.
    if (Date.now() - dockShownAt < DOCK_CLICK_IGNORE_MS) {
      e.stopPropagation()
      return
    }
    hideDock()
  })

  // ─── Loading overlay helpers ──────────────────────────────────────────────────
  function showLoading(label: string) {
    $loadingLabel.textContent = `Loading ${label}\u2026`
    $loadingOverlay.classList.add('visible')
  }

  function hideLoading() {
    $loadingOverlay.classList.remove('visible')
  }

  // ─── Switch to app ────────────────────────────────────────────────────────────
  // Every app frame, and the tour's Plugin Config frame, gets this sandbox.
  // allow-top-navigation-by-user-activation lets a dock opened inside a dock
  // break out to the top window (the guard at the top of this file).
  const FRAME_SANDBOX =
    'allow-same-origin allow-scripts allow-forms allow-popups allow-pointer-lock allow-top-navigation-by-user-activation'

  // The server's admin UI leads anywhere: into a webapp, a plugin's page or
  // another of its own screens. Its tile opens it fresh every time, at the
  // URL the tile points to, so it never resumes wherever it was left.
  function opensFresh(app: DockApp): boolean {
    try {
      const url = new URL(app.url, window.location.href)
      return url.origin === window.location.origin && /^\/admin(\/|$)/.test(url.pathname)
    } catch {
      return false
    }
  }

  // Reloads the frame at the page it is on now. A frame on another origin
  // refuses access to its location, so it starts over at the app's URL.
  function reloadFrame($frame: HTMLIFrameElement, app: DockApp) {
    showLoading(app.label)
    $frame.addEventListener('load', hideLoading, { once: true })
    try {
      $frame.contentWindow?.location.reload()
    } catch {
      $frame.src = app.url
    }
  }

  function switchToApp(index: number) {
    const app = cfg.apps[index]
    if (!app) return

    hideIdleHint()

    // The night-mode and fullscreen buttons are .dock-items too; only app
    // items carry a data-index.
    document.querySelectorAll<HTMLElement>('.dock-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.index === String(index))
    })

    const fresh = opensFresh(app)
    const alreadyLoaded = !fresh && !!iframes[app.url]

    // Tapping the app already on screen reloads it where it is, so a webapp
    // updated on the server is picked up without restarting the browser.
    // destroy mode and fresh apps get a new frame below anyway.
    if (alreadyLoaded && cfg.iframeMode !== 'destroy' && iframes[app.url].classList.contains('active')) {
      reloadFrame(iframes[app.url], app)
      updateHandle()
      hideDock()
      return
    }

    if (cfg.iframeMode === 'destroy') {
      $iframeContainer.innerHTML = ''
      Object.keys(iframes).forEach((k) => delete iframes[k])
    } else {
      Object.values(iframes).forEach((f) => f.classList.remove('active'))
    }

    if (fresh && iframes[app.url]) {
      iframes[app.url].remove()
      delete iframes[app.url]
    }

    if (!iframes[app.url]) {
      if (!alreadyLoaded) showLoading(app.label)

      const $frame = document.createElement('iframe')
      $frame.allow = 'fullscreen; geolocation'
      $frame.setAttribute('sandbox', FRAME_SANDBOX)
      $frame.style.touchAction = 'auto'

      $frame.addEventListener('load', hideLoading, { once: true })

      $iframeContainer.appendChild($frame)
      $frame.src = app.url

      iframes[app.url] = $frame
    }

    iframes[app.url].classList.add('active')
    updateHandle()
    hideDock()
  }

  // ─── Gesture: full-screen double-tap ────────────────────────────────────────
  // No overlay element. We attach passive, non-preventDefault listeners to the
  // parent document AND each same-origin iframe's contentDocument (recursively,
  // to handle webapps like KIP that embed other apps), so webapps receive every
  // tap/click normally. A double-tap anywhere opens the dock. Side effect:
  // double-tapping a button fires that button once before the dock opens —
  // users are expected to aim double-taps at non-interactive regions.
  const DOUBLE_TAP_MS = 450
  const DOUBLE_TAP_SLOP = 40

  let lastTapTime = 0
  let lastTapX = 0
  let lastTapY = 0
  // Coordinates are in the dock's viewport unless a tap names another space:
  // two taps pair up only within the same one.
  let lastTapSpace: TapSpace = null

  // Taps are timed by when they happened, not when their handler ran: a page
  // busy rendering can hold a pointerdown back long enough to split a
  // double-tap. Times are on the clock every document in the browser shares,
  // performance.timeOrigin plus the page's own high-resolution time.
  function nowTime() {
    return performance.timeOrigin + performance.now()
  }

  function eventTime(doc: Document, e: Event): number {
    const perf = doc.defaultView && doc.defaultView.performance
    return perf ? perf.timeOrigin + e.timeStamp : nowTime()
  }

  function triggerDock() {
    if (DEBUG) console.log('[Dock] triggerDock called, dockVisible=', dockVisible)
    if (dockVisible) return
    showDock()
    if (DEBUG) {
      const r = $dock.getBoundingClientRect()
      console.log('[Dock] after showDock: dock rect', r, 'classes', $dock.className)
    }
    if (navigator.vibrate) navigator.vibrate(8)
  }

  const DEBUG = new URLSearchParams(location.search).has('debugDock')

  function handleTap(clientX: number, clientY: number, space: TapSpace = null, time = nowTime()) {
    if (dockVisible) return
    const dx = clientX - lastTapX
    const dy = clientY - lastTapY
    const dist = Math.round(Math.sqrt(dx * dx + dy * dy))
    const close = dist <= DOUBLE_TAP_SLOP && space === lastTapSpace
    const gap = time - lastTapTime
    const match = gap >= 0 && gap < DOUBLE_TAP_MS && close
    if (DEBUG) {
      console.log('[Dock] tap', { x: Math.round(clientX), y: Math.round(clientY), gap, dist, close, match })
    }
    if (match) {
      lastTapTime = 0
      triggerDock()
    } else {
      lastTapTime = time
      lastTapX = clientX
      lastTapY = clientY
      lastTapSpace = space
    }
  }

  const listenedDocs = new WeakSet<Document>()

  function attachTapListener(doc: Document, frameEl: HTMLIFrameElement | null) {
    if (listenedDocs.has(doc)) return
    listenedDocs.add(doc)

    const offset = (): Point => {
      if (!frameEl) return { x: 0, y: 0 }
      const r = frameEl.getBoundingClientRect()
      return { x: r.left, y: r.top }
    }

    // Dedupe: touchstart and pointerdown often both fire for the same gesture.
    // We accept whichever arrives first and ignore the other if it's within
    // 50 ms (the browser's synthesized-event coalescence window). The window is
    // measured in event time: after the page stalls, two real taps can be
    // handled back to back, and neither may be taken for the other's twin.
    let lastEventAt = -Infinity
    const COALESCE_MS = 50

    const onDown = (x: number, y: number, time: number) => {
      if (Math.abs(time - lastEventAt) < COALESCE_MS) return
      lastEventAt = time
      handleTap(x, y, null, time)
    }

    doc.addEventListener(
      'pointerdown',
      (e) => {
        const o = offset()
        onDown(e.clientX + o.x, e.clientY + o.y, eventTime(doc, e))
      },
      { passive: true, capture: true }
    )

    // Fallback for Windows touchscreens + some browsers where the root
    // document does not receive pointerdown for finger input (observed on
    // W11 with touch-action: none). touchstart is the universally-supported
    // event for direct touch.
    doc.addEventListener(
      'touchstart',
      (e) => {
        if (!e.touches || e.touches.length === 0) return
        const t = e.touches[0]
        const o = offset()
        onDown(t.clientX + o.x, t.clientY + o.y, eventTime(doc, e))
      },
      { passive: true, capture: true }
    )
  }

  // Recursively attach to iframes at any nesting depth. Webapps like KIP
  // embed other webapps (e.g. FSK) in their own iframes, so we walk the tree
  // and observe each same-origin contentDocument for future iframe additions.
  const attachedDocs = new WeakSet<Document>()

  function attachToIframe(frame: HTMLIFrameElement) {
    const wire = () => {
      let doc: Document | null = null
      try {
        doc = frame.contentDocument
      } catch {
        // cross-origin; can't reach
      }
      const app = appFrameOf(frame)
      if (app) noteFrameReach(app, frame, doc !== null)
      if (!doc || attachedDocs.has(doc)) return
      attachedDocs.add(doc)
      attachTapListener(doc, frame)
      scanAndObserveDoc(doc)
    }
    frame.addEventListener('load', wire)
    wire()
  }

  function scanAndObserveDoc(doc: Document) {
    // Attach to iframes already in this document.
    doc.querySelectorAll('iframe').forEach((f) => attachToIframe(f))

    // Observe future iframe additions anywhere in the doc tree.
    const root = doc.documentElement || doc.body || doc
    const obs = new MutationObserver((records) => {
      for (const r of records) {
        r.addedNodes.forEach((node) => {
          if (!node || node.nodeType !== Node.ELEMENT_NODE) return
          // An element from a frame's document fails instanceof checks against
          // this window's classes, so it is told apart by its tag name.
          const n = node as Element
          if (n.tagName === 'IFRAME') attachToIframe(n as HTMLIFrameElement)
          // Descendants: catch iframes added as part of a subtree.
          n.querySelectorAll('iframe').forEach((f) => attachToIframe(f))
        })
        // A removed frame may have been the one keeping the handle up.
        if (r.removedNodes.length > 0) updateHandle()
      }
    })
    obs.observe(root, { childList: true, subtree: true })
  }

  // ─── Apps on another origin ──────────────────────────────────────────────────
  // The listeners above cannot reach a page from another origin, so a
  // double-tap over one goes unseen. That page may be the app itself or a
  // frame inside it. Such a page can forward its pointerdowns instead, and
  // while any page in the active app is out of reach and not forwarding, a
  // tab at the dock's edge opens the dock with a single tap.
  //
  // A forwarded pointerdown is a message posted to the dock's window:
  //   window.top.postMessage({ type: 'signalk-app-dock:pointerdown', x: e.clientX, y: e.clientY }, '*')
  // It counts only from inside a frame of the active app that the listeners
  // cannot reach, so no tap is counted twice, and all it can do is feed the
  // double-tap detection.
  const FORWARDED_POINTERDOWN = 'signalk-app-dock:pointerdown'
  const FORWARD_COALESCE_MS = 50
  // Per app frame, the frames in it (itself included) the listeners cannot
  // reach, and which of those have sent a pointerdown of their own since they
  // loaded.
  const unreachableFrames = new WeakMap<HTMLIFrameElement, Set<HTMLIFrameElement>>()
  const forwardingFrames = new WeakSet<HTMLIFrameElement>()
  let lastForwardedAt = -Infinity

  // The app frame a frame belongs to: the frame itself, or the one holding
  // the document it sits in, found through same-origin parents.
  function appFrameOf(frame: HTMLIFrameElement): HTMLIFrameElement | null {
    let f: HTMLIFrameElement | null = frame
    while (f && f.parentElement !== $iframeContainer) {
      const win: Window | null = f.ownerDocument && f.ownerDocument.defaultView
      f = win ? (win.frameElement as HTMLIFrameElement | null) : null
    }
    return f
  }

  // Runs on every load of a frame in an app. A new document starts over:
  // whether it forwards is not known until it does, and an app frame's new
  // document brings its own frames.
  function noteFrameReach(app: HTMLIFrameElement, frame: HTMLIFrameElement, reachable: boolean) {
    forwardingFrames.delete(frame)
    let frames = unreachableFrames.get(app)
    if (frame === app || !frames) {
      frames = new Set()
      unreachableFrames.set(app, frames)
    }
    if (reachable) frames.delete(frame)
    else frames.add(frame)
    updateHandle()
  }

  // Frames removed from their document, or left in one that has been
  // navigated away, are dropped as they are found.
  function liveUnreachableFrames(app: HTMLIFrameElement | null): Set<HTMLIFrameElement> {
    const frames = (app && unreachableFrames.get(app)) || new Set()
    for (const f of frames) {
      if (!f.isConnected || !f.ownerDocument.defaultView) frames.delete(f)
    }
    return frames
  }

  function updateHandle() {
    const app = $iframeContainer.querySelector<HTMLIFrameElement>('iframe.active')
    let show = false
    if (!dockVisible) {
      for (const f of liveUnreachableFrames(app)) {
        if (!forwardingFrames.has(f)) show = true
      }
    }
    $dockHandle.classList.toggle('visible', show)
  }

  // Where a frame's content starts in the dock's viewport, adding up the
  // frames it sits in.
  function offsetInDock(frame: HTMLIFrameElement): Point {
    let x = 0
    let y = 0
    for (let f: HTMLIFrameElement | null = frame; f;) {
      const r = f.getBoundingClientRect()
      x += r.left
      y += r.top
      if (f.parentElement === $iframeContainer) break
      const win: Window | null = f.ownerDocument.defaultView
      f = win ? (win.frameElement as HTMLIFrameElement | null) : null
    }
    return { x, y }
  }

  function isInsideFrame(source: MessageEventSource, frameWindow: Window | null): boolean {
    for (let w: Window | null = source as Window; w; w = w.parent) {
      if (w === frameWindow) return true
      if (w === w.parent) return false
    }
    return false
  }

  window.addEventListener('message', (e: MessageEvent) => {
    const data = e.data as ForwardedPointerdown | null
    if (!data || data.type !== FORWARDED_POINTERDOWN) return
    if (!isFiniteNumber(data.x) || !isFiniteNumber(data.y)) return
    const app = $iframeContainer.querySelector<HTMLIFrameElement>('iframe.active')
    if (!app || !e.source) return
    let from: HTMLIFrameElement | null = null
    for (const f of liveUnreachableFrames(app)) {
      if (isInsideFrame(e.source, f.contentWindow)) from = f
    }
    if (!from) return
    // A frame inside the page forwarding says nothing about taps on the page
    // around it, so only the page's own message stops the handle.
    if (e.source === from.contentWindow) {
      forwardingFrames.add(from)
      updateHandle()
    }
    // The page can say when the tap happened. Without that, or with a time
    // that has not come yet, the message's arrival stands in for it.
    const received = nowTime()
    const time = isFiniteNumber(data.t) && data.t <= received ? data.t : received
    if (Math.abs(time - lastForwardedAt) < FORWARD_COALESCE_MS) return
    lastForwardedAt = time
    // A frame inside the page sits somewhere the dock cannot see, so its
    // taps keep their own coordinates and pair up only with each other.
    if (e.source === from.contentWindow) {
      const o = offsetInDock(from)
      handleTap(data.x + o.x, data.y + o.y, null, time)
    } else {
      handleTap(data.x, data.y, e.source, time)
    }
  })

  $dockHandle.addEventListener('click', triggerDock)

  attachTapListener(document, null)
  attachedDocs.add(document)
  scanAndObserveDoc(document)

  // ─── Init ────────────────────────────────────────────────────────────────────
  buildDock()

  if (cfg.showNightModeButton && nightModeUsable) {
    void fetchCurrentMode()
    setInterval(fetchCurrentMode, 5000)
  }

  if (cfg.showFullscreenButton && fullscreenSupported()) {
    document.addEventListener('fullscreenchange', updateFullscreenIcon)
  }

  // Changes to any of these require a full rebuild (dock classes, magnification
  // constants, dock items, etc.) — easiest to just reload the page.
  const STRUCTURAL_KEYS: (keyof DockConfig)[] = [
    'position',
    'iframeMode',
    'iconSize',
    'magnification',
    'magnificationScale',
    'showNightModeButton',
    'showFullscreenButton',
    'showExitButton'
  ]

  async function refreshConfig() {
    try {
      const prev = cfg
      let next = cfg
      if (noAdminAccess) {
        next = (await fetchSharedConfig()) || prev
      } else {
        const [configRes, settingsRes] = await Promise.all([
          fetch('/plugins/signalk-app-dock/config'),
          fetch('/plugins/signalk-app-dock/settings')
        ])
        if (configRes.ok) {
          const data = await configRes.json()
          const pluginCfg: Partial<DockConfig> = data.configuration || data
          next = { ...DEFAULTS, ...pluginCfg, apps: prev.apps }
        }
        if (settingsRes.ok) {
          const data = await settingsRes.json()
          if (Array.isArray(data.apps) && data.apps.length > 0) {
            next = { ...next, apps: data.apps }
          }
        }
      }
      const structuralChanged = STRUCTURAL_KEYS.some((k) => prev[k] !== next[k])
      if (structuralChanged) {
        window.location.reload()
        return
      }
      if (JSON.stringify(next.apps) !== JSON.stringify(prev.apps)) {
        cfg = next
        buildDock()
      } else {
        cfg = next
      }
    } catch {
      // ignore transient errors (e.g. during plugin restart)
    }
  }

  if (pluginReachable) setInterval(refreshConfig, 5000)

  // ─── Welcome tour ────────────────────────────────────────────────────────────
  const $tourOverlay = document.getElementById('tour-overlay')
  const $tourGotIt = document.getElementById('tour-btn-got-it')
  const $tourDismiss = document.getElementById('tour-btn-dismiss')

  function hideTour() {
    $tourOverlay?.classList.remove('visible')
    hideDock()
  }

  function showTour() {
    $tourOverlay?.classList.add('visible')
    showDock()
  }

  if ($tourGotIt) $tourGotIt.addEventListener('click', hideTour)

  // "Don't show again" POSTs /dismiss-tour, which saves tourDismissed in the
  // plugin configuration, so it applies to every user. The plugin opens that
  // route to readwrite users. Everyone else who is not an admin, and anyone
  // /settings did not serve the dock to, gets no button rather than one that
  // advertises a setting we can't honour. The tour reappears on their next
  // visit.
  if (!pluginReachable || !canWrite) {
    if ($tourDismiss) $tourDismiss.remove()
    document.getElementById('tour-buttons')?.style.setProperty('justify-content', 'center')
  } else if ($tourDismiss) {
    $tourDismiss.addEventListener('click', () => {
      hideTour()
      // Network errors are ignored; at worst the user sees the tour again on the
      // next reload.
      fetch('/plugins/signalk-app-dock/dismiss-tour', { method: 'POST' }).catch(() => {})
    })
  }

  const $tourLink = document.getElementById('tour-link')
  if ($tourLink) {
    if (noAdminAccess) {
      // Non-admin visitors can't reach Plugin Config; replace the link with
      // plain text so the tour doesn't advertise a dead-end.
      $tourLink.replaceWith(document.createTextNode('Plugin Config (admin only)'))
    } else {
      $tourLink.addEventListener('click', (e) => {
        e.preventDefault()
        const adminUrl = '/admin/#/serverConfiguration/plugins/signalk-app-dock'
        hideIdleHint()
        const $frame = document.createElement('iframe')
        $frame.allow = 'fullscreen; geolocation'
        $frame.setAttribute('sandbox', FRAME_SANDBOX)
        $frame.style.touchAction = 'auto'
        $frame.classList.add('active')
        $iframeContainer.innerHTML = ''
        Object.keys(iframes).forEach((k) => delete iframes[k])
        $iframeContainer.appendChild($frame)
        $frame.src = adminUrl
        iframes[adminUrl] = $frame
        hideTour()
      })
    }
  }

  if (!cfg.tourDismissed) showTour()

  const autostartIdx = cfg.apps.findIndex((a) => a.autostart)
  if (autostartIdx >= 0) {
    switchToApp(autostartIdx)
  } else {
    setIdleHint()
  }
})().catch((e: unknown) => console.error('[Dock] failed to start', e))
