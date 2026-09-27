'use strict'

const DEFAULT_APPS = [
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

module.exports = (app) => {
  let pluginSettings = {}
  let resolvedApps = []
  let running = false

  function resolveApps(settings) {
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
  function savedSettings() {
    return app.readPluginOptions().configuration || {}
  }

  function getWebapps() {
    return (app.webapps || [])
      .filter((w) => w.name !== '@signalk/app-dock' && w.name !== '@signalk/server-admin-ui')
      .map((w) => ({
        name: w.name,
        label: w.signalk?.displayName || w.name,
        url: `/${w.name}/`,
        icon: w.signalk?.appIcon ? `/${w.name}/${w.signalk.appIcon.replace(/^\.\//, '')}` : null
      }))
  }

  const plugin = {
    id: 'signalk-app-dock',
    name: 'App Dock',

    start(settings) {
      if (!Array.isArray(settings.apps)) {
        const seeded = DEFAULT_APPS.map((a) => ({ ...a }))
        const seededSettings = {
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
          (context, path, value, _callback) => {
            if (value !== 'day' && value !== 'night') {
              return { state: 'COMPLETED', statusCode: 400, message: 'Invalid mode' }
            }
            app.handleMessage(plugin.id, {
              updates: [{ values: [{ path: 'environment.mode', value }] }]
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

    registerWithRouter(router) {
      // Routes registered on the router itself are admin-only. signalk-server
      // 2.31 and later add router.access(), which opens a route to readonly or
      // readwrite users; on older servers every route stays admin-only.
      const openTo = (level) => (typeof router.access === 'function' ? router.access(level) : router)

      openTo('readonly').get('/settings', (req, res) => {
        const settings = running ? pluginSettings : savedSettings()
        res.json({
          ...settings,
          apps: running ? resolvedApps : resolveApps(settings)
        })
      })

      router.get('/webapps', (req, res) => {
        res.json(getWebapps())
      })

      openTo('readonly').get('/mode', (req, res) => {
        const current = app.getSelfPath('environment.mode')
        res.json({ value: (current && current.value) || 'day' })
      })

      openTo('readwrite').post('/dismiss-tour', (req, res) => {
        // savePluginOptions replaces the whole saved configuration, so the
        // update starts from a complete one.
        const updated = { ...(running ? pluginSettings : savedSettings()), tourDismissed: true }
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

    schema: {
      type: 'object',
      description:
        'Open /@signalk/app-dock/config.html for the visual configurator with discover button and drag-to-reorder.',
      required: [],
      properties: {
        position: {
          type: 'string',
          title: 'Dock position',
          enum: ['bottom', 'top', 'left', 'right'],
          default: 'bottom'
        },

        iframeMode: {
          type: 'string',
          title: 'iFrame lifecycle',
          description:
            'keep-alive: load once and hide/show (faster switching, more RAM). ' +
            'destroy: reload on every switch (slower, minimal RAM).',
          enum: ['keep-alive', 'destroy'],
          default: 'keep-alive'
        },

        iconSize: {
          type: 'number',
          title: 'Icon size (px)',
          default: 56
        },

        magnification: {
          type: 'boolean',
          title: 'Enable dock magnification effect',
          default: true
        },

        magnificationScale: {
          type: 'number',
          title: 'Magnification scale (1.0 = none, 2.5 = maximum)',
          default: 1.7
        },

        showNightModeButton: {
          type: 'boolean',
          title: 'Show night/day mode toggle',
          description: 'Adds a sun/moon button to the dock that toggles environment.mode',
          default: true
        },

        showFullscreenButton: {
          type: 'boolean',
          title: 'Show fullscreen toggle',
          description:
            'Adds a button to the dock that toggles browser fullscreen. ' +
            'Hidden automatically when the Fullscreen API is not available (e.g. iPadOS Safari — use Add to Home Screen instead).',
          default: false
        },

        showExitButton: {
          type: 'boolean',
          title: 'Show exit button',
          description: 'Adds an X button to the dock that returns to Signal K admin UI',
          default: false
        },

        tourDismissed: {
          type: 'boolean',
          title: 'Welcome tour dismissed',
          description:
            'Set automatically when a user clicks "Don\'t show again" in the welcome tour. Uncheck to show the tour again on all devices.',
          default: false
        },

        apps: {
          type: 'array',
          title: 'Dock Apps',
          description:
            'Installed webapps are added here automatically. Reorder, disable, or override labels/icons as needed.',
          items: {
            type: 'object',
            required: ['url'],
            properties: {
              enabled: {
                type: 'boolean',
                title: 'Enabled',
                default: true
              },
              autostart: {
                type: 'boolean',
                title: 'Autostart',
                description: 'Load this app automatically when the dock page opens',
                default: false
              },
              url: {
                type: 'string',
                title: 'URL'
              },
              label: {
                type: 'string',
                title: 'Label override'
              },
              icon: {
                type: 'string',
                title: 'Icon override',
                description: 'Emoji or image path'
              },
              color: {
                type: 'string',
                title: 'Background color'
              }
            }
          },
          default: []
        }
      }
    }
  }

  return plugin
}
