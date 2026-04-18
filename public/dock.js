;(async function DockApp() {
  'use strict'

  const DEFAULTS = {
    position: 'bottom',
    iframeMode: 'keep-alive',
    iconSize: 56,
    magnification: true,
    magnificationScale: 1.7,
    showNightModeButton: true,
    showExitButton: false,
    apps: []
  }

  // ─── Load config from plugin endpoints ───────────────────────────────────────
  let cfg = { ...DEFAULTS }
  try {
    const [configRes, settingsRes] = await Promise.all([
      fetch('/plugins/signalk-app-dock/config'),
      fetch('/plugins/signalk-app-dock/settings')
    ])
    if (configRes.ok) {
      const data = await configRes.json()
      const pluginCfg = data.configuration || data
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

  if (!Array.isArray(cfg.apps) || cfg.apps.length === 0) {
    console.warn('[Dock] No apps configured — open Plugin Config to add webapps.')
  }

  // ─── DOM refs ────────────────────────────────────────────────────────────────
  const $iframeContainer = document.getElementById('iframe-container')
  const $backdrop = document.getElementById('dock-backdrop')
  const $dock = document.getElementById('dock')
  const $dockInner = document.getElementById('dock-inner')
  const $loadingOverlay = document.getElementById('loading-overlay')
  const $loadingLabel = document.getElementById('loading-label')
  const $idleHint = document.getElementById('idle-hint')
  const $idleHintText = document.getElementById('idle-hint-text')

  // ─── State ───────────────────────────────────────────────────────────────────
  let dockVisible = false
  const iframes = {}

  // ─── Night mode state ────────────────────────────────────────────────────────
  let currentMode = 'day'

  async function fetchCurrentMode() {
    try {
      const res = await fetch('/plugins/signalk-app-dock/mode')
      if (res.ok) {
        const data = await res.json()
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

  // ─── Apply dock position class & alignment ───────────────────────────────────
  const pos = cfg.position
  $dock.classList.add(`pos-${pos}`)
  $dockInner.classList.add(`align-${pos}`)

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
        .then((apps) => {
          const me = apps.find((a) => a.name === '@signalk/app-dock')
          if (me) $version.textContent = 'v' + me.version
        })
        .catch(() => {})
    }

    if (!cfg.apps || cfg.apps.length === 0) {
      $idleHintText.innerHTML =
        'No apps configured yet.<br>' +
        'Open <strong>Admin UI \u2192 Plugin Config \u2192 App Dock</strong><br>' +
        'and click <strong>Discover Installed Webapps</strong> to get started.'
      return
    }

    $idleHintText.innerHTML =
      'Double-tap <strong>anywhere</strong> to open the dock' +
      '<br><br><span style="font-size:12px;opacity:0.6">Configure in Admin UI \u2192 Plugin Config \u2192 App Dock</span>'
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
  function createUtilityItem(className, icon, label, onClick) {
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

    if (cfg.showNightModeButton) {
      $dockInner.appendChild(createUtilityItem('dock-item-nightmode', '\u2600\uFE0F', 'Night mode', toggleNightMode))
      $dockInner.appendChild(createSeparator())
    }

    cfg.apps.forEach((app, i) => {
      const $item = document.createElement('div')
      $item.className = 'dock-item'
      $item.dataset.index = i

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
  }

  // ─── Magnification ───────────────────────────────────────────────────────────
  let magRafPending = false
  let magScrubbed = false
  let magTouchStartAxis = 0

  function applyMagnification(pointerPos) {
    const items = $dockInner.querySelectorAll('.dock-item')
    let closestIdx = -1
    let closestDist = Infinity

    items.forEach((item, i) => {
      const icon = item.querySelector('.dock-icon')
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
    const items = $dockInner.querySelectorAll('.dock-item')
    const sz = cfg.iconSize

    items.forEach((item) => {
      const icon = item.querySelector('.dock-icon')
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
  }

  function hideDock() {
    if (!dockVisible) return
    if ($tourOverlay && $tourOverlay.classList.contains('visible')) return
    dockVisible = false
    $dock.classList.remove('visible')
    $backdrop.classList.remove('visible')
    resetMagnification()
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
  function showLoading(label) {
    $loadingLabel.textContent = `Loading ${label}\u2026`
    $loadingOverlay.classList.add('visible')
  }

  function hideLoading() {
    $loadingOverlay.classList.remove('visible')
  }

  // ─── Switch to app ────────────────────────────────────────────────────────────
  function switchToApp(index) {
    const app = cfg.apps[index]
    if (!app) return

    hideIdleHint()

    document.querySelectorAll('.dock-item').forEach((el, i) => {
      el.classList.toggle('active', i === index)
    })

    const alreadyLoaded = !!iframes[app.url]

    if (cfg.iframeMode === 'destroy') {
      $iframeContainer.innerHTML = ''
      Object.keys(iframes).forEach((k) => delete iframes[k])
    } else {
      Object.values(iframes).forEach((f) => f.classList.remove('active'))
    }

    if (!iframes[app.url]) {
      if (!alreadyLoaded) showLoading(app.label)

      const $frame = document.createElement('iframe')
      $frame.allow = 'fullscreen; geolocation'
      $frame.sandbox = 'allow-same-origin allow-scripts allow-forms allow-popups allow-pointer-lock'
      $frame.style.touchAction = 'auto'

      $frame.addEventListener('load', hideLoading, { once: true })

      $iframeContainer.appendChild($frame)
      $frame.src = app.url

      iframes[app.url] = $frame
    }

    iframes[app.url].classList.add('active')
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

  function handleTap(clientX, clientY) {
    if (dockVisible) return
    const now = Date.now()
    const dx = clientX - lastTapX
    const dy = clientY - lastTapY
    const dist = Math.round(Math.sqrt(dx * dx + dy * dy))
    const close = dist <= DOUBLE_TAP_SLOP
    const gap = now - lastTapTime
    const match = gap < DOUBLE_TAP_MS && close
    if (DEBUG) {
      console.log('[Dock] tap', { x: Math.round(clientX), y: Math.round(clientY), gap, dist, close, match })
    }
    if (match) {
      lastTapTime = 0
      triggerDock()
    } else {
      lastTapTime = now
      lastTapX = clientX
      lastTapY = clientY
    }
  }

  function attachTapListener(doc, frameEl) {
    if (!doc || doc.__dockListenersAttached) return
    doc.__dockListenersAttached = true

    const offset = () => {
      if (!frameEl) return { x: 0, y: 0 }
      const r = frameEl.getBoundingClientRect()
      return { x: r.left, y: r.top }
    }

    // Dedupe: touchstart and pointerdown often both fire for the same gesture.
    // We accept whichever arrives first and ignore the other if it's within
    // 50 ms (the browser's synthesized-event coalescence window).
    let lastEventAt = 0
    const COALESCE_MS = 50

    const onDown = (x, y) => {
      const now = Date.now()
      if (now - lastEventAt < COALESCE_MS) return
      lastEventAt = now
      handleTap(x, y)
    }

    doc.addEventListener(
      'pointerdown',
      (e) => {
        const o = offset()
        onDown(e.clientX + o.x, e.clientY + o.y)
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
        onDown(t.clientX + o.x, t.clientY + o.y)
      },
      { passive: true, capture: true }
    )
  }

  // Recursively attach to iframes at any nesting depth. Webapps like KIP
  // embed other webapps (e.g. FSK) in their own iframes, so we walk the tree
  // and observe each same-origin contentDocument for future iframe additions.
  const attachedDocs = new WeakSet()

  function attachToIframe(frame) {
    const wire = () => {
      let doc
      try {
        doc = frame.contentDocument
      } catch {
        return // cross-origin; can't reach
      }
      if (!doc || attachedDocs.has(doc)) return
      attachedDocs.add(doc)
      attachTapListener(doc, frame)
      scanAndObserveDoc(doc)
    }
    frame.addEventListener('load', wire)
    wire()
  }

  function scanAndObserveDoc(doc) {
    // Attach to iframes already in this document.
    doc.querySelectorAll('iframe').forEach((f) => attachToIframe(f))

    // Observe future iframe additions anywhere in the doc tree.
    const root = doc.documentElement || doc.body || doc
    const obs = new MutationObserver((records) => {
      for (const r of records) {
        r.addedNodes.forEach((n) => {
          if (!n || n.nodeType !== 1) return
          if (n.tagName === 'IFRAME') attachToIframe(n)
          // Descendants: catch iframes added as part of a subtree.
          const nested = n.querySelectorAll && n.querySelectorAll('iframe')
          if (nested) nested.forEach((f) => attachToIframe(f))
        })
      }
    })
    obs.observe(root, { childList: true, subtree: true })
  }

  attachTapListener(document, null)
  attachedDocs.add(document)
  scanAndObserveDoc(document)

  // ─── Init ────────────────────────────────────────────────────────────────────
  buildDock()

  if (cfg.showNightModeButton) {
    fetchCurrentMode()
    setInterval(fetchCurrentMode, 5000)
  }

  // Changes to any of these require a full rebuild (dock classes, magnification
  // constants, dock items, etc.) — easiest to just reload the page.
  const STRUCTURAL_KEYS = [
    'position',
    'iframeMode',
    'iconSize',
    'magnification',
    'magnificationScale',
    'showNightModeButton',
    'showExitButton'
  ]

  async function refreshConfig() {
    try {
      const [configRes, settingsRes] = await Promise.all([
        fetch('/plugins/signalk-app-dock/config'),
        fetch('/plugins/signalk-app-dock/settings')
      ])
      const prev = cfg
      let next = cfg
      if (configRes.ok) {
        const data = await configRes.json()
        const pluginCfg = data.configuration || data
        next = { ...DEFAULTS, ...pluginCfg, apps: prev.apps }
      }
      if (settingsRes.ok) {
        const data = await settingsRes.json()
        if (Array.isArray(data.apps) && data.apps.length > 0) {
          next = { ...next, apps: data.apps }
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

  setInterval(refreshConfig, 5000)

  // ─── Welcome tour ────────────────────────────────────────────────────────────
  const $tourOverlay = document.getElementById('tour-overlay')
  const $tourGotIt = document.getElementById('tour-btn-got-it')
  const $tourDismiss = document.getElementById('tour-btn-dismiss')

  function hideTour() {
    $tourOverlay.classList.remove('visible')
    hideDock()
  }

  function showTour() {
    $tourOverlay.classList.add('visible')
    showDock()
  }

  if ($tourGotIt) $tourGotIt.addEventListener('click', hideTour)
  if ($tourDismiss) {
    $tourDismiss.addEventListener('click', async () => {
      hideTour()
      try {
        await fetch('/plugins/signalk-app-dock/dismiss-tour', { method: 'POST' })
      } catch {
        // ignore network errors; worst case user sees the tour again next reload
      }
    })
  }

  const $tourLink = document.getElementById('tour-link')
  if ($tourLink) {
    $tourLink.addEventListener('click', (e) => {
      e.preventDefault()
      const adminUrl = '/admin/#/serverConfiguration/plugins/signalk-app-dock'
      hideIdleHint()
      const $frame = document.createElement('iframe')
      $frame.allow = 'fullscreen; geolocation'
      $frame.sandbox = 'allow-same-origin allow-scripts allow-forms allow-popups allow-pointer-lock'
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

  if (!cfg.tourDismissed) showTour()

  const autostartIdx = cfg.apps.findIndex((a) => a.autostart)
  if (autostartIdx >= 0) {
    switchToApp(autostartIdx)
  } else {
    setIdleHint()
  }
})()
