'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const fs = require('fs')

const pluginFactory = require('../plugin/index.js')

function createMockApp(webapps = []) {
  return {
    webapps,
    debug: () => {},
    error: () => {},
    savePluginOptions: (opts, cb) => cb(null),
    registerPutHandler: () => {},
    handleMessage: () => {},
    getSelfPath: () => null
  }
}

const MOCK_WEBAPPS = [
  {
    name: '@signalk/freeboard-sk',
    signalk: { displayName: 'Freeboard-SK', appIcon: './assets/icons/icon-72x72.png' }
  },
  {
    name: '@mxtommy/kip',
    signalk: { displayName: 'KIP Instrument MFD', appIcon: 'assets/icon-72x72.png' }
  },
  {
    name: '@signalk/app-dock',
    signalk: { displayName: 'App Dock' }
  },
  {
    name: '@signalk/server-admin-ui',
    signalk: { displayName: 'Admin UI' }
  }
]

describe('plugin identity', () => {
  it('returns correct id and name', () => {
    const plugin = pluginFactory(createMockApp())
    assert.equal(plugin.id, 'signalk-app-dock')
    assert.equal(plugin.name, 'App Dock')
  })

  it('has required plugin interface methods', () => {
    const plugin = pluginFactory(createMockApp())
    assert.equal(typeof plugin.start, 'function')
    assert.equal(typeof plugin.stop, 'function')
    assert.equal(typeof plugin.registerWithRouter, 'function')
  })
})

describe('schema', () => {
  it('defines all expected properties', () => {
    const plugin = pluginFactory(createMockApp())
    const props = Object.keys(plugin.schema.properties)
    assert.ok(props.includes('position'))
    assert.ok(props.includes('triggerCorner'))
    assert.ok(props.includes('iframeMode'))
    assert.ok(props.includes('iconSize'))
    assert.ok(props.includes('magnification'))
    assert.ok(props.includes('magnificationScale'))
    assert.ok(props.includes('apps'))
  })

  it('position enum contains all four edges', () => {
    const plugin = pluginFactory(createMockApp())
    const posEnum = plugin.schema.properties.position.enum
    assert.deepEqual(posEnum, ['bottom', 'top', 'left', 'right'])
  })

  it('apps items require url', () => {
    const plugin = pluginFactory(createMockApp())
    const items = plugin.schema.properties.apps.items
    assert.deepEqual(items.required, ['url'])
  })

  it('defines showNightModeButton with default false', () => {
    const plugin = pluginFactory(createMockApp())
    const prop = plugin.schema.properties.showNightModeButton
    assert.equal(prop.type, 'boolean')
    assert.equal(prop.default, false)
  })

  it('defines showExitButton with default false', () => {
    const plugin = pluginFactory(createMockApp())
    const prop = plugin.schema.properties.showExitButton
    assert.equal(prop.type, 'boolean')
    assert.equal(prop.default, false)
  })
})

describe('webapp discovery', () => {
  it('filters out @signalk/app-dock and admin-ui from /webapps', (t, done) => {
    const app = createMockApp(MOCK_WEBAPPS)
    const plugin = pluginFactory(app)
    const routes = {}
    const router = {
      get: (path, handler) => {
        routes[path] = handler
      }
    }
    plugin.registerWithRouter(router)

    const res = {
      json: (data) => {
        assert.equal(data.length, 2)
        assert.ok(data.every((w) => w.name !== '@signalk/app-dock'))
        assert.ok(data.every((w) => w.name !== '@signalk/server-admin-ui'))
        done()
      }
    }
    routes['/webapps']({}, res)
  })

  it('maps webapp metadata correctly', (t, done) => {
    const app = createMockApp(MOCK_WEBAPPS)
    const plugin = pluginFactory(app)
    const routes = {}
    const router = {
      get: (path, handler) => {
        routes[path] = handler
      }
    }
    plugin.registerWithRouter(router)

    const res = {
      json: (data) => {
        const fb = data.find((w) => w.name === '@signalk/freeboard-sk')
        assert.equal(fb.label, 'Freeboard-SK')
        assert.equal(fb.url, '/@signalk/freeboard-sk/')
        assert.equal(fb.icon, '/@signalk/freeboard-sk/assets/icons/icon-72x72.png')
        done()
      }
    }
    routes['/webapps']({}, res)
  })

  it('handles missing signalk metadata gracefully', (t, done) => {
    const app = createMockApp([{ name: 'bare-plugin' }])
    const plugin = pluginFactory(app)
    const routes = {}
    const router = {
      get: (path, handler) => {
        routes[path] = handler
      }
    }
    plugin.registerWithRouter(router)

    const res = {
      json: (data) => {
        assert.equal(data.length, 1)
        assert.equal(data[0].label, 'bare-plugin')
        assert.equal(data[0].icon, null)
        done()
      }
    }
    routes['/webapps']({}, res)
  })

  it('returns empty array when app.webapps is undefined', (t, done) => {
    const app = createMockApp()
    delete app.webapps
    const plugin = pluginFactory(app)
    const routes = {}
    const router = {
      get: (path, handler) => {
        routes[path] = handler
      }
    }
    plugin.registerWithRouter(router)

    const res = {
      json: (data) => {
        assert.deepEqual(data, [])
        done()
      }
    }
    routes['/webapps']({}, res)
  })
})

describe('settings endpoint', () => {
  it('returns plugin settings with resolved apps', (t, done) => {
    const app = createMockApp()
    const plugin = pluginFactory(app)
    plugin.start({ position: 'left', iconSize: 64, apps: [] })

    const routes = {}
    const router = {
      get: (path, handler) => {
        routes[path] = handler
      }
    }
    plugin.registerWithRouter(router)

    const res = {
      json: (data) => {
        assert.equal(data.position, 'left')
        assert.equal(data.iconSize, 64)
        assert.ok(Array.isArray(data.apps))
        done()
      }
    }
    routes['/settings']({}, res)
  })
})

describe('auto-discovery on start', () => {
  it('merges discovered webapps into configured apps after delay', (t, done) => {
    const app = createMockApp(MOCK_WEBAPPS)
    let savedOptions = null
    app.savePluginOptions = (opts, cb) => {
      savedOptions = opts
      cb(null)
    }

    const plugin = pluginFactory(app)

    const originalSetTimeout = globalThis.setTimeout
    globalThis.setTimeout = (fn) => fn()
    try {
      plugin.start({ apps: [] })
    } finally {
      globalThis.setTimeout = originalSetTimeout
    }

    assert.ok(savedOptions)
    assert.ok(savedOptions.apps.length >= 2)
    assert.ok(savedOptions.apps.some((a) => a.url === '/@signalk/freeboard-sk/'))
    assert.ok(savedOptions.apps.some((a) => a.url === '/@mxtommy/kip/'))
    done()
  })

  it('does not duplicate already-configured apps', (t, done) => {
    const app = createMockApp(MOCK_WEBAPPS)
    let savedOptions = null
    app.savePluginOptions = (opts, cb) => {
      savedOptions = opts
      cb(null)
    }

    const plugin = pluginFactory(app)
    const existing = [{ enabled: true, url: '/@signalk/freeboard-sk/', label: 'FB', icon: '', color: '' }]

    const originalSetTimeout = globalThis.setTimeout
    globalThis.setTimeout = (fn) => fn()
    try {
      plugin.start({ apps: existing })
    } finally {
      globalThis.setTimeout = originalSetTimeout
    }

    const fbEntries = savedOptions.apps.filter((a) => a.url === '/@signalk/freeboard-sk/')
    assert.equal(fbEntries.length, 1)
    assert.equal(fbEntries[0].label, 'FB')
    done()
  })

  it('skips save when no new apps are discovered', () => {
    const app = createMockApp(MOCK_WEBAPPS)
    let saveCalled = false
    app.savePluginOptions = () => {
      saveCalled = true
    }

    const plugin = pluginFactory(app)
    const allConfigured = [
      { enabled: true, url: '/@signalk/freeboard-sk/', label: '', icon: '', color: '' },
      { enabled: true, url: '/@mxtommy/kip/', label: '', icon: '', color: '' }
    ]

    const originalSetTimeout = globalThis.setTimeout
    globalThis.setTimeout = (fn) => fn()
    try {
      plugin.start({ apps: allConfigured })
    } finally {
      globalThis.setTimeout = originalSetTimeout
    }

    assert.equal(saveCalled, false)
  })

  it('respects enabled:false when resolving apps', () => {
    const app = createMockApp(MOCK_WEBAPPS)
    app.savePluginOptions = (_, cb) => cb(null)
    const plugin = pluginFactory(app)

    const configured = [
      { enabled: false, url: '/@signalk/freeboard-sk/', label: '', icon: '', color: '' },
      { enabled: true, url: '/@mxtommy/kip/', label: '', icon: '', color: '' }
    ]

    const originalSetTimeout = globalThis.setTimeout
    globalThis.setTimeout = (fn) => fn()
    try {
      plugin.start({ apps: configured })
    } finally {
      globalThis.setTimeout = originalSetTimeout
    }

    const routes = {}
    const router = {
      get: (path, handler) => {
        routes[path] = handler
      }
    }
    plugin.registerWithRouter(router)

    let resolved
    routes['/settings'](
      {},
      {
        json: (d) => {
          resolved = d
        }
      }
    )
    assert.ok(!resolved.apps.some((a) => a.url === '/@signalk/freeboard-sk/'))
    assert.ok(resolved.apps.some((a) => a.url === '/@mxtommy/kip/'))
  })

  it('uses discovered label/icon when config overrides are empty', () => {
    const app = createMockApp(MOCK_WEBAPPS)
    app.savePluginOptions = (_, cb) => cb(null)
    const plugin = pluginFactory(app)

    const configured = [{ enabled: true, url: '/@mxtommy/kip/', label: '', icon: '', color: '' }]

    const originalSetTimeout = globalThis.setTimeout
    globalThis.setTimeout = (fn) => fn()
    try {
      plugin.start({ apps: configured })
    } finally {
      globalThis.setTimeout = originalSetTimeout
    }

    const routes = {}
    const router = {
      get: (path, handler) => {
        routes[path] = handler
      }
    }
    plugin.registerWithRouter(router)

    let resolved
    routes['/settings'](
      {},
      {
        json: (d) => {
          resolved = d
        }
      }
    )
    const kip = resolved.apps.find((a) => a.url === '/@mxtommy/kip/')
    assert.equal(kip.label, 'KIP Instrument MFD')
    assert.equal(kip.icon, '/@mxtommy/kip/assets/icon-72x72.png')
  })
})

describe('package.json', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'))

  it('has signalk-node-server-plugin keyword', () => {
    assert.ok(pkg.keywords.includes('signalk-node-server-plugin'))
  })

  it('has signalk-webapp keyword', () => {
    assert.ok(pkg.keywords.includes('signalk-webapp'))
  })

  it('has signalk-plugin-configurator keyword', () => {
    assert.ok(pkg.keywords.includes('signalk-plugin-configurator'))
  })

  it('main points to plugin/index.js', () => {
    assert.equal(pkg.main, 'plugin/index.js')
    assert.ok(fs.existsSync(path.join(__dirname, '..', pkg.main)))
  })
})

describe('night mode PUT handler', () => {
  it('registers PUT handler when showNightModeButton is true', () => {
    let registered = false
    const app = createMockApp()
    app.registerPutHandler = (context, path, callback, sourceId) => {
      registered = true
      assert.equal(context, 'vessels.self')
      assert.equal(path, 'environment.mode')
      assert.equal(sourceId, 'signalk-app-dock')
    }

    const plugin = pluginFactory(app)
    const originalSetTimeout = globalThis.setTimeout
    globalThis.setTimeout = (fn) => fn()
    try {
      plugin.start({ showNightModeButton: true, apps: [] })
    } finally {
      globalThis.setTimeout = originalSetTimeout
    }
    assert.ok(registered)
  })

  it('does not register PUT handler when showNightModeButton is false', () => {
    let registered = false
    const app = createMockApp()
    app.registerPutHandler = () => {
      registered = true
    }

    const plugin = pluginFactory(app)
    const originalSetTimeout = globalThis.setTimeout
    globalThis.setTimeout = (fn) => fn()
    try {
      plugin.start({ showNightModeButton: false, apps: [] })
    } finally {
      globalThis.setTimeout = originalSetTimeout
    }
    assert.equal(registered, false)
  })

  it('PUT handler accepts valid mode values and emits delta', () => {
    const app = createMockApp()
    let handlerCallback
    let emittedDelta = null
    app.registerPutHandler = (ctx, path, cb) => {
      handlerCallback = cb
    }
    app.handleMessage = (id, delta) => {
      emittedDelta = delta
    }

    const plugin = pluginFactory(app)
    const originalSetTimeout = globalThis.setTimeout
    globalThis.setTimeout = (fn) => fn()
    try {
      plugin.start({ showNightModeButton: true, apps: [] })
    } finally {
      globalThis.setTimeout = originalSetTimeout
    }

    const result = handlerCallback('vessels.self', 'environment.mode', 'night', () => {})
    assert.equal(result.state, 'COMPLETED')
    assert.equal(result.statusCode, 200)
    assert.equal(emittedDelta.updates[0].values[0].path, 'environment.mode')
    assert.equal(emittedDelta.updates[0].values[0].value, 'night')
  })

  it('PUT handler rejects invalid mode values', () => {
    const app = createMockApp()
    let handlerCallback
    app.registerPutHandler = (ctx, path, cb) => {
      handlerCallback = cb
    }

    const plugin = pluginFactory(app)
    const originalSetTimeout = globalThis.setTimeout
    globalThis.setTimeout = (fn) => fn()
    try {
      plugin.start({ showNightModeButton: true, apps: [] })
    } finally {
      globalThis.setTimeout = originalSetTimeout
    }

    const result = handlerCallback('vessels.self', 'environment.mode', 'invalid', () => {})
    assert.equal(result.statusCode, 400)
  })
})

describe('mode endpoint', () => {
  it('returns day when no mode is set', (t, done) => {
    const app = createMockApp()
    const plugin = pluginFactory(app)
    const routes = {}
    const router = {
      get: (path, handler) => {
        routes[path] = handler
      }
    }
    plugin.registerWithRouter(router)

    const res = {
      json: (data) => {
        assert.equal(data.value, 'day')
        done()
      }
    }
    routes['/mode']({}, res)
  })

  it('returns current mode when set', (t, done) => {
    const app = createMockApp()
    app.getSelfPath = (path) => {
      if (path === 'environment.mode') return { value: 'night' }
      return null
    }
    const plugin = pluginFactory(app)
    const routes = {}
    const router = {
      get: (path, handler) => {
        routes[path] = handler
      }
    }
    plugin.registerWithRouter(router)

    const res = {
      json: (data) => {
        assert.equal(data.value, 'night')
        done()
      }
    }
    routes['/mode']({}, res)
  })
})

describe('public files', () => {
  const publicDir = path.join(__dirname, '..', 'public')

  it('index.html exists', () => {
    assert.ok(fs.existsSync(path.join(publicDir, 'index.html')))
  })

  it('dock.js exists', () => {
    assert.ok(fs.existsSync(path.join(publicDir, 'dock.js')))
  })

  it('dock.css exists', () => {
    assert.ok(fs.existsSync(path.join(publicDir, 'dock.css')))
  })

  it('remoteEntry.js exists (Module Federation)', () => {
    assert.ok(fs.existsSync(path.join(publicDir, 'remoteEntry.js')))
  })

  it('app-icon.svg exists', () => {
    assert.ok(fs.existsSync(path.join(publicDir, 'app-icon.svg')))
  })

  it('icon-settings.svg exists', () => {
    assert.ok(fs.existsSync(path.join(publicDir, 'icon-settings.svg')))
  })
})
