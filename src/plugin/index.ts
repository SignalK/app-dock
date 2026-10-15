import type { ActionResult, Path, Plugin, ServerAPI } from '@signalk/server-api'
import type { IRouter } from 'express'
import { ConfigSchema, type AppEntry, type Config, type DiscoveredWebapp, type ResolvedApp } from './schema.js'

const DEFAULT_APPS: AppEntry[] = [
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

// An installed webapp as signalk-server lists it on app.webapps, which
// ServerAPI does not declare.
interface InstalledWebapp {
  name: string
  signalk?: { displayName?: string; appIcon?: string }
}

type DockServerAPI = ServerAPI & { webapps?: InstalledWebapp[] }

type AccessLevel = 'readonly' | 'readwrite'

// signalk-server 2.31 and later add router.access(), which @signalk/server-api
// does not declare.
type AccessRouter = IRouter & { access?: (level: AccessLevel) => IRouter }

export default function appDock(app: DockServerAPI): Plugin {
  let pluginSettings: Config = {}
  let resolvedApps: ResolvedApp[] = []
  let running = false

  function resolveApps(settings: Config): ResolvedApp[] {
    return (Array.isArray(settings.apps) ? settings.apps : [])
      .filter((a) => a.enabled !== false)
      .map((a) => ({
        label: a.label || a.url,
        url: a.url,
        icon: a.icon || null,
        color: a.color || null,
        autostart: a.autostart || false
      }))
  }

  // The configuration as saved, the one /config serves. While the plugin is
  // not running, pluginSettings is empty (never started) or holds what the
  // last start() got, which a later save may have replaced.
  function savedSettings(): Config {
    return (app.readPluginOptions() as { configuration?: Config }).configuration || {}
  }

  function getWebapps(): DiscoveredWebapp[] {
    return (app.webapps || [])
      .filter((w) => w.name !== '@signalk/app-dock' && w.name !== '@signalk/server-admin-ui')
      .map((w) => ({
        name: w.name,
        label: w.signalk?.displayName || w.name,
        url: `/${w.name}/`,
        icon: w.signalk?.appIcon ? `/${w.name}/${w.signalk.appIcon.replace(/^\.\//, '')}` : null
      }))
  }

  const plugin: Plugin = {
    id: 'signalk-app-dock',
    name: 'App Dock',

    start(config: object) {
      let settings = config as Config
      if (!Array.isArray(settings.apps)) {
        const seeded = DEFAULT_APPS.map((a) => ({ ...a }))
        const seededSettings: Config = {
          showNightModeButton: true,
          showFullscreenButton: false,
          showExitButton: false,
          ...settings,
          apps: seeded
        }
        app.debug('App Dock: first run, seeding %d default apps', seeded.length)
        app.savePluginOptions(seededSettings, (err) => {
          if (err) app.error('App Dock: failed to save default apps: ' + err.message)
          else app.debug('App Dock: saved default apps to config')
        })
        settings = seededSettings
      }

      pluginSettings = settings

      if (settings.showNightModeButton) {
        app.registerPutHandler(
          'vessels.self',
          'environment.mode',
          (_context, _path, value): ActionResult => {
            if (value !== 'day' && value !== 'night') {
              return { state: 'COMPLETED', statusCode: 400, message: 'Invalid mode' }
            }
            app.handleMessage(plugin.id, {
              updates: [{ values: [{ path: 'environment.mode' as Path, value }] }]
            })
            return { state: 'COMPLETED', statusCode: 200 }
          },
          plugin.id
        )
      }

      resolvedApps = resolveApps(settings)
      running = true

      app.debug('App Dock: resolved %d apps: %s', resolvedApps.length, resolvedApps.map((a) => a.label).join(', '))
    },

    stop() {
      running = false
    },

    registerWithRouter(router: AccessRouter) {
      // Routes registered on the router itself are admin-only. signalk-server
      // 2.31 and later add router.access(), which opens a route to readonly or
      // readwrite users; on older servers every route stays admin-only.
      const openTo = (level: AccessLevel): IRouter =>
        typeof router.access === 'function' ? router.access(level) : router

      openTo('readonly').get('/settings', (_req, res) => {
        const settings = running ? pluginSettings : savedSettings()
        res.json({
          ...settings,
          apps: running ? resolvedApps : resolveApps(settings)
        })
      })

      router.get('/webapps', (_req, res) => {
        res.json(getWebapps())
      })

      openTo('readonly').get('/mode', (_req, res) => {
        const current = app.getSelfPath('environment.mode') as { value?: unknown } | null | undefined
        res.json({ value: current?.value || 'day' })
      })

      openTo('readwrite').post('/dismiss-tour', (_req, res) => {
        // savePluginOptions replaces the whole saved configuration, so the
        // update starts from a complete one.
        const updated: Config = { ...(running ? pluginSettings : savedSettings()), tourDismissed: true }
        app.savePluginOptions(updated, (err) => {
          if (err) {
            app.error('App Dock: failed to save tourDismissed: ' + err.message)
            res.status(500).json({ error: err.message })
            return
          }
          pluginSettings = updated
          res.json({ tourDismissed: true })
        })
      })
    },

    schema: ConfigSchema
  }

  return plugin
}
