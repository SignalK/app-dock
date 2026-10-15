import type { AppEntry, Config } from '../plugin/schema'

// The standalone configurator at config.html, which the plugin schema's
// description links to. The admin UI shows the React config panel instead.

interface WebappListing {
  name: string
  signalk?: { displayName?: string; appIcon?: string }
}

// The plugin configuration as the server's /plugins/<id>/config serves it.
interface PluginConfigResponse {
  configuration?: Config
  [key: string]: unknown
}

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id)
  if (!el) throw new Error(`config.html: #${id} is missing`)
  return el as T
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

const $discoverBtn = byId<HTMLButtonElement>('discover-btn')
const $saveBtn = byId<HTMLButtonElement>('save-btn')
const $status = byId('status')
const $list = byId<HTMLUListElement>('app-list')
const $empty = byId('empty-state')
const $preview = byId('dock-preview')

let apps: AppEntry[] = []

async function loadCurrent() {
  try {
    const res = await fetch('/plugins/signalk-app-dock/config')
    if (res.ok) {
      const data: PluginConfigResponse = await res.json()
      apps = (data.configuration && data.configuration.apps) || []
      render()
    }
  } catch (e) {
    console.warn('Could not load current config', e)
  }
}

async function discover() {
  $discoverBtn.disabled = true
  $discoverBtn.textContent = 'Discovering...'
  $status.textContent = ''
  $status.className = 'status'

  try {
    const res = await fetch('/skServer/webapps')
    const allWebapps: WebappListing[] = await res.json()
    const webapps = allWebapps
      .filter((w) => w.name !== '@signalk/app-dock' && w.name !== '@signalk/server-admin-ui')
      .map((w) => ({
        name: w.name,
        label: w.signalk?.displayName || w.name,
        url: `/${w.name}/`,
        icon: w.signalk?.appIcon ? `/${w.name}/${w.signalk.appIcon}` : null
      }))

    if (webapps.length === 0) {
      $status.textContent = 'No webapps found. Is the server fully started?'
      $status.className = 'status error'
      $discoverBtn.disabled = false
      $discoverBtn.textContent = 'Discover Installed Webapps'
      return
    }

    const existingUrls = new Set(apps.map((a) => a.url))
    let added = 0
    for (const w of webapps) {
      if (!existingUrls.has(w.url)) {
        apps.push({
          enabled: true,
          url: w.url,
          label: w.label || '',
          icon: w.icon || '',
          color: ''
        })
        added++
      }
    }

    $status.textContent =
      added > 0
        ? `Found ${webapps.length} webapps, added ${added} new.`
        : `All ${webapps.length} webapps already in list.`
    render()
  } catch (e) {
    $status.textContent = 'Discovery failed: ' + errorMessage(e)
    $status.className = 'status error'
  }

  $discoverBtn.disabled = false
  $discoverBtn.textContent = 'Discover Installed Webapps'
}

async function save() {
  try {
    const cfgRes = await fetch('/plugins/signalk-app-dock/config')
    const current: PluginConfigResponse = await cfgRes.json()
    const newConfig = {
      ...current,
      configuration: {
        ...(current.configuration || {}),
        apps: apps
      }
    }

    const res = await fetch('/plugins/signalk-app-dock/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newConfig)
    })

    if (res.ok) {
      $status.textContent = 'Saved! Plugin will restart with new config.'
      $status.className = 'status'
    } else {
      $status.textContent = 'Save failed: ' + res.statusText
      $status.className = 'status error'
    }
  } catch (e) {
    $status.textContent = 'Save failed: ' + errorMessage(e)
    $status.className = 'status error'
  }
}

function removeApp(index: number) {
  apps.splice(index, 1)
  render()
}

function toggleApp(index: number) {
  apps[index].enabled = !apps[index].enabled
  render()
}

function renderIcon(app: AppEntry): string {
  const iconVal = app.icon || ''
  if (iconVal.startsWith('/') || iconVal.startsWith('http')) {
    return `<img src="${iconVal}" alt="${app.label}" onerror="this.parentNode.textContent='${(app.label || app.url || '??').slice(0, 2).toUpperCase()}'">`
  }
  return iconVal || (app.label || app.url || '??').slice(0, 2).toUpperCase()
}

function render() {
  if (apps.length === 0) {
    $list.innerHTML = ''
    $empty.style.display = ''
    $preview.innerHTML = '<span style="color:#555;font-size:13px">No apps</span>'
    return
  }

  $empty.style.display = 'none'

  $list.innerHTML = apps
    .map(
      (app, i) => `
        <li class="app-item" draggable="true" data-index="${i}" style="opacity:${app.enabled === false ? 0.4 : 1}">
          <span class="drag-handle">≡</span>
          <div class="app-icon-preview" ${app.color ? `style="background:${app.color}"` : ''}>
            ${renderIcon(app)}
          </div>
          <div class="app-info">
            <div class="app-name">${app.label || app.url}</div>
            <div class="app-url">${app.url}</div>
          </div>
          <div class="app-toggle">
            <input type="checkbox" ${app.enabled !== false ? 'checked' : ''} data-action="toggle" title="Enable/disable">
          </div>
          <div class="app-actions">
            <button class="btn btn-danger" data-action="remove">Remove</button>
          </div>
        </li>
      `
    )
    .join('')

  initDragDrop()

  $preview.innerHTML = apps
    .filter((a) => a.enabled !== false)
    .map(
      (app) => `
          <div class="dock-preview-icon" ${app.color ? `style="background:${app.color}"` : ''}>
            ${renderIcon(app)}
          </div>
        `
    )
    .join('')
}

let dragIndex: number | null = null
function initDragDrop() {
  const items = document.querySelectorAll<HTMLLIElement>('.app-item')
  items.forEach((item) => {
    item.addEventListener('dragstart', (e) => {
      dragIndex = parseInt(item.dataset.index || '', 10)
      item.classList.add('dragging')
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
    })
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging')
      document.querySelectorAll('.app-item').forEach((el) => el.classList.remove('drag-over'))
    })
    item.addEventListener('dragover', (e) => {
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
      item.classList.add('drag-over')
    })
    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-over')
    })
    item.addEventListener('drop', (e) => {
      e.preventDefault()
      const dropIndex = parseInt(item.dataset.index || '', 10)
      if (dragIndex !== null && dragIndex !== dropIndex) {
        const moved = apps.splice(dragIndex, 1)[0]
        apps.splice(dropIndex, 0, moved)
        render()
      }
    })
  })
}

// The row's checkbox and Remove button, found from the list so the handlers
// survive every render() that rewrites it.
function actionTarget(e: Event): { action: string; index: number } | null {
  const target = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>('[data-action]') : null
  const item = target?.closest<HTMLElement>('.app-item')
  if (!target || !item) return null
  return { action: target.dataset.action || '', index: parseInt(item.dataset.index || '', 10) }
}

$list.addEventListener('change', (e) => {
  const hit = actionTarget(e)
  if (hit?.action === 'toggle') toggleApp(hit.index)
})

$list.addEventListener('click', (e) => {
  const hit = actionTarget(e)
  if (hit?.action === 'remove') removeApp(hit.index)
})

// discover(), save() and loadCurrent() report their own errors.
$discoverBtn.addEventListener('click', () => void discover())
$saveBtn.addEventListener('click', () => void save())

void loadCurrent()
