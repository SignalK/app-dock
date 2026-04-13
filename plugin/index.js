'use strict'

module.exports = (app) => {
  let pluginSettings = {}
  let resolvedApps = []

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
      pluginSettings = settings

      setTimeout(() => {
        const discovered = getWebapps()
        if (discovered.length === 0) return

        const configured = settings.apps || []
        const configuredUrls = new Set(configured.map((a) => a.url))

        const merged = [...configured]
        let added = false
        for (const w of discovered) {
          if (!configuredUrls.has(w.url)) {
            merged.push({ enabled: true, url: w.url, label: '', icon: '', color: '' })
            added = true
          }
        }

        const discoveredByUrl = {}
        discovered.forEach((d) => {
          discoveredByUrl[d.url] = d
        })

        resolvedApps = merged
          .filter((a) => a.enabled !== false)
          .map((a) => {
            const match = discoveredByUrl[a.url]
            return {
              label: a.label || (match && match.label) || a.url,
              url: a.url,
              icon: a.icon || (match && match.icon) || null,
              color: a.color || null,
              autostart: a.autostart || false
            }
          })

        if (added) {
          app.savePluginOptions({ ...settings, apps: merged }, (err) => {
            if (err) app.error('Failed to save discovered apps: ' + err.message)
            else app.debug('Auto-discovered new webapps, saved to config')
          })
        }

        app.debug('Dock apps: %s', resolvedApps.map((a) => a.label).join(', '))
      }, 5000)
    },

    stop() {},

    registerWithRouter(router) {
      router.get('/settings', (req, res) => {
        res.json({
          ...pluginSettings,
          apps: resolvedApps
        })
      })

      router.get('/webapps', (req, res) => {
        res.json(getWebapps())
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

        triggerCorner: {
          type: 'string',
          title: 'Double-tap corner',
          description: 'Screen corner that activates the dock on double-tap',
          enum: ['bottom-right', 'bottom-left', 'top-right', 'top-left'],
          default: 'bottom-right'
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
