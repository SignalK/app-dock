'use strict'

module.exports = (app) => {
  let currentSettings = {}

  const plugin = {
    id: 'signalk-app-dock',
    name: 'App Dock',

    start (settings) {
      currentSettings = settings
    },

    stop () {},

    registerWithRouter (router) {
      router.get('/config', (req, res) => {
        res.json(currentSettings)
      })

      router.get('/webapps', (req, res) => {
        try {
          const webapps = (app.webapps || []).map(w => ({
            name:    w.name,
            label:   w.metadata?.displayName || w.name,
            url:     `/${w.name}/`,
            icon:    w.metadata?.appIcon ? `/${w.name}/${w.metadata.appIcon}` : null
          }))
          res.json(webapps)
        } catch (err) {
          app.debug('Could not enumerate webapps: %s', err.message)
          res.json([])
        }
      })
    },

    schema: {
      type: 'object',
      required: [],
      properties: {

        position: {
          type: 'string',
          title: 'Dock position',
          enum:  ['bottom', 'top', 'left', 'right'],
          default: 'bottom'
        },

        trigger: {
          type: 'string',
          title: 'Show trigger',
          description: 'How the dock is revealed',
          enum:  ['longpress', 'swipe', 'both'],
          default: 'both'
        },

        triggerCorner: {
          type: 'string',
          title: 'Long-press corner',
          description: 'Screen corner that activates the dock on long-press',
          enum:  ['bottom-right', 'bottom-left', 'top-right', 'top-left'],
          default: 'bottom-right'
        },

        longPressDuration: {
          type: 'number',
          title: 'Long-press duration (ms)',
          default: 400
        },

        iframeMode: {
          type: 'string',
          title: 'iFrame lifecycle',
          description:
            'keep-alive: load once and hide/show (faster switching, more RAM). ' +
            'destroy: reload on every switch (slower, minimal RAM).',
          enum:  ['keep-alive', 'destroy'],
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
          title: 'Apps',
          description: 'Ordered list of apps shown in the dock',
          items: {
            type: 'object',
            required: ['label', 'url'],
            properties: {
              label: {
                type: 'string',
                title: 'Label'
              },
              url: {
                type: 'string',
                title: 'URL (relative or absolute)',
                description: 'e.g. /kip/ or /@signalk/freeboard-sk/'
              },
              icon: {
                type: 'string',
                title: 'Icon',
                description: 'Emoji or path to an image'
              },
              color: {
                type: 'string',
                title: 'Icon background color',
                description: 'CSS color, e.g. #1a1a2e or rgba(0,100,200,0.8)'
              }
            }
          },
          default: [
            { label: 'KIP',       url: '/kip/',                     icon: '/kip/assets/icon-72x72.png', color: '#0d1b2a' },
            { label: 'Freeboard', url: '/@signalk/freeboard-sk/',   icon: '/@signalk/freeboard-sk/assets/icons/icon-72x72.png', color: '#1b2838' },
            { label: 'Radar',     url: '/radar/',                   icon: '/radar/assets/icon-72x72.png', color: '#1a0a0a' }
          ]
        }
      }
    }
  }

  return plugin
}
