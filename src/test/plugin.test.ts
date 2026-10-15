import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs'

import appDock from '../plugin/index.js'

// From dist/test/ back to the package root.
const root = path.join(import.meta.dirname, '..', '..')

interface PutResult {
  state: string
  statusCode?: number
  message?: string
}

type PutHandler = (context: string, path: string, value: unknown, callback: () => void) => PutResult

// The part of the server API the plugin uses, as each test sets it up.
interface MockApp {
  webapps?: object[]
  debug: (...args: unknown[]) => void
  error: (msg: string) => void
  savePluginOptions: (options: object, cb: (err: Error | null) => void) => void
  readPluginOptions: () => object
  registerPutHandler: (context: string, path: string, callback: PutHandler, source?: string) => void
  handleMessage: (id: string, delta: any) => void
  getSelfPath: (path: string) => unknown
}

interface TestPlugin {
  id: string
  name: string
  schema: any
  start(config: object): void
  stop(): void
  registerWithRouter(router: object): void
}

interface MockResponse {
  json: (data: any) => void
  status: (code: number) => MockResponse
}

type RouteHandler = (req: object, res: MockResponse) => void

interface Routes {
  get: Record<string, RouteHandler>
  post: Record<string, RouteHandler>
}

function pluginFactory(app: MockApp): TestPlugin {
  return appDock(app as unknown as Parameters<typeof appDock>[0]) as unknown as TestPlugin
}

function createMockApp(webapps: object[] = []): MockApp {
  return {
    webapps,
    debug: () => {},
    error: () => {},
    savePluginOptions: (_options, cb) => cb(null),
    readPluginOptions: () => ({}),
    registerPutHandler: () => {},
    handleMessage: () => {},
    getSelfPath: () => null
  }
}

// Registers the plugin's routes on a router without access(), so every route
// lands on the router itself, and returns them by method and path.
function registerRoutes(plugin: TestPlugin): Routes {
  const routes: Routes = { get: {}, post: {} }
  plugin.registerWithRouter({
    get: (path: string, handler: RouteHandler) => {
      routes.get[path] = handler
    },
    post: (path: string, handler: RouteHandler) => {
      routes.post[path] = handler
    }
  })
  return routes
}

// Calls a route handler and resolves with the body it sends.
function request(handler: RouteHandler | undefined): Promise<any> {
  assert.ok(handler, 'route is registered')
  return new Promise((resolve) => {
    const res: MockResponse = { json: resolve, status: () => res }
    handler({}, res)
  })
}

// Starts the plugin with the night-mode button on and returns the PUT handler
// it registers.
function startWithPutHandler(app: MockApp): PutHandler {
  let handler: PutHandler | undefined
  app.registerPutHandler = (_context, _path, callback) => {
    handler = callback
  }
  pluginFactory(app).start({ showNightModeButton: true, apps: [] })
  assert.ok(handler, 'PUT handler is registered')
  return handler
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
    assert.ok(props.includes('iframeMode'))
    assert.ok(props.includes('iconSize'))
    assert.ok(props.includes('magnification'))
    assert.ok(props.includes('magnificationScale'))
    assert.ok(props.includes('apps'))
    assert.ok(!props.includes('triggerCorner'), 'triggerCorner should be removed')
    assert.ok(!props.includes('longPressActivation'), 'longPressActivation should be removed')
  })

  it('position is a string enum of all four edges', () => {
    const plugin = pluginFactory(createMockApp())
    const position = plugin.schema.properties.position
    assert.equal(position.type, 'string')
    assert.deepEqual(position.enum, ['bottom', 'top', 'left', 'right'])
  })

  it('apps items require url', () => {
    const plugin = pluginFactory(createMockApp())
    const items = plugin.schema.properties.apps.items
    assert.deepEqual(items.required, ['url'])
  })

  it('defines showNightModeButton with default true', () => {
    const plugin = pluginFactory(createMockApp())
    const prop = plugin.schema.properties.showNightModeButton
    assert.equal(prop.type, 'boolean')
    assert.equal(prop.default, true)
  })

  it('defines showExitButton with default false', () => {
    const plugin = pluginFactory(createMockApp())
    const prop = plugin.schema.properties.showExitButton
    assert.equal(prop.type, 'boolean')
    assert.equal(prop.default, false)
  })

  it('defines tourDismissed with default false', () => {
    const plugin = pluginFactory(createMockApp())
    const prop = plugin.schema.properties.tourDismissed
    assert.equal(prop.type, 'boolean')
    assert.equal(prop.default, false)
  })

  it('serializes to plain JSON Schema with no top-level required fields', () => {
    const plugin = pluginFactory(createMockApp())
    const json = JSON.parse(JSON.stringify(plugin.schema))
    assert.equal(json.type, 'object')
    assert.ok(!json.required || json.required.length === 0)
  })
})

describe('webapp discovery', () => {
  it('filters out @signalk/app-dock and admin-ui from /webapps', async () => {
    const routes = registerRoutes(pluginFactory(createMockApp(MOCK_WEBAPPS)))
    const data = await request(routes.get['/webapps'])
    assert.equal(data.length, 2)
    assert.ok(data.every((w: any) => w.name !== '@signalk/app-dock'))
    assert.ok(data.every((w: any) => w.name !== '@signalk/server-admin-ui'))
  })

  it('maps webapp metadata correctly', async () => {
    const routes = registerRoutes(pluginFactory(createMockApp(MOCK_WEBAPPS)))
    const data = await request(routes.get['/webapps'])
    const fb = data.find((w: any) => w.name === '@signalk/freeboard-sk')
    assert.equal(fb.label, 'Freeboard-SK')
    assert.equal(fb.url, '/@signalk/freeboard-sk/')
    assert.equal(fb.icon, '/@signalk/freeboard-sk/assets/icons/icon-72x72.png')
  })

  it('handles missing signalk metadata gracefully', async () => {
    const routes = registerRoutes(pluginFactory(createMockApp([{ name: 'bare-plugin' }])))
    const data = await request(routes.get['/webapps'])
    assert.equal(data.length, 1)
    assert.equal(data[0].label, 'bare-plugin')
    assert.equal(data[0].icon, null)
  })

  it('returns empty array when app.webapps is undefined', async () => {
    const app = createMockApp()
    delete app.webapps
    const routes = registerRoutes(pluginFactory(app))
    assert.deepEqual(await request(routes.get['/webapps']), [])
  })
})

describe('settings endpoint', () => {
  it('returns plugin settings with resolved apps', async () => {
    const plugin = pluginFactory(createMockApp())
    plugin.start({ position: 'left', iconSize: 64, apps: [] })
    const data = await request(registerRoutes(plugin).get['/settings'])
    assert.equal(data.position, 'left')
    assert.equal(data.iconSize, 64)
    assert.ok(Array.isArray(data.apps))
  })

  it('serves the saved configuration before the plugin has started', async () => {
    const app = createMockApp()
    app.readPluginOptions = () => ({
      enabled: false,
      configuration: {
        position: 'right',
        apps: [
          { url: '/a/', label: 'A', enabled: true },
          { url: '/b/', label: 'B', enabled: false }
        ]
      }
    })
    const data = await request(registerRoutes(pluginFactory(app)).get['/settings'])
    assert.equal(data.position, 'right')
    assert.deepEqual(data.apps, [{ label: 'A', url: '/a/', icon: null, color: null, autostart: false }])
  })

  it('serves no apps when the saved apps value is not an array', async () => {
    const app = createMockApp()
    app.readPluginOptions = () => ({ enabled: false, configuration: { apps: {} } })
    const data = await request(registerRoutes(pluginFactory(app)).get['/settings'])
    assert.deepEqual(data.apps, [])
  })

  it('serves the saved configuration after stop()', async () => {
    const app = createMockApp()
    app.readPluginOptions = () => ({ enabled: false, configuration: { position: 'top', apps: [] } })
    const plugin = pluginFactory(app)
    plugin.start({ position: 'left', apps: [{ url: '/a/', label: 'A' }] })
    plugin.stop()
    const data = await request(registerRoutes(plugin).get['/settings'])
    assert.equal(data.position, 'top')
    assert.deepEqual(data.apps, [])
  })
})

describe('default apps seeding', () => {
  it('seeds default apps when config has no apps key', () => {
    const app = createMockApp()
    let savedOptions: any = null
    app.savePluginOptions = (options, cb) => {
      savedOptions = options
      cb(null)
    }

    pluginFactory(app).start({})

    assert.ok(savedOptions)
    assert.equal(savedOptions.apps[0].url, '/@signalk/freeboard-sk/')
    assert.equal(savedOptions.apps[0].autostart, true)
    assert.equal(savedOptions.apps[1].url, '/@halos-org/skip/')
    assert.equal(savedOptions.apps[1].autostart, false)
    assert.equal(savedOptions.apps[2].url, '/admin/')
    assert.equal(savedOptions.apps[2].label, 'Settings')
  })

  it('does not seed when apps array already exists (even if empty)', () => {
    const app = createMockApp()
    let saveCalled = false
    app.savePluginOptions = () => {
      saveCalled = true
    }

    pluginFactory(app).start({ apps: [] })

    assert.equal(saveCalled, false)
  })

  it('preserves existing configured apps', () => {
    const app = createMockApp()
    let saveCalled = false
    app.savePluginOptions = () => {
      saveCalled = true
    }

    const existing = [{ enabled: true, url: '/custom-app/', label: 'Custom', icon: '', color: '' }]
    pluginFactory(app).start({ apps: existing })

    assert.equal(saveCalled, false)
  })

  it('respects enabled:false when resolving apps', async () => {
    const plugin = pluginFactory(createMockApp())
    const configured = [
      { enabled: false, url: '/@signalk/freeboard-sk/', label: '', icon: '', color: '' },
      { enabled: true, url: '/@mxtommy/kip/', label: '', icon: '', color: '' }
    ]
    plugin.start({ apps: configured })

    const resolved = await request(registerRoutes(plugin).get['/settings'])
    assert.ok(!resolved.apps.some((a: any) => a.url === '/@signalk/freeboard-sk/'))
    assert.ok(resolved.apps.some((a: any) => a.url === '/@mxtommy/kip/'))
  })
})

describe('package.json', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'))

  it('has signalk-node-server-plugin keyword', () => {
    assert.ok(pkg.keywords.includes('signalk-node-server-plugin'))
  })

  it('has signalk-webapp keyword', () => {
    assert.ok(pkg.keywords.includes('signalk-webapp'))
  })

  it('has signalk-plugin-configurator keyword', () => {
    assert.ok(pkg.keywords.includes('signalk-plugin-configurator'))
  })

  it('main points to the built plugin', () => {
    assert.equal(pkg.main, 'dist/plugin/index.js')
    assert.ok(fs.existsSync(path.join(root, pkg.main)))
  })
})

describe('night mode PUT handler', () => {
  it('registers PUT handler when showNightModeButton is true', () => {
    let registered = false
    const app = createMockApp()
    app.registerPutHandler = (context, path, _callback, sourceId) => {
      registered = true
      assert.equal(context, 'vessels.self')
      assert.equal(path, 'environment.mode')
      assert.equal(sourceId, 'signalk-app-dock')
    }

    pluginFactory(app).start({ showNightModeButton: true, apps: [] })
    assert.ok(registered)
  })

  it('does not register PUT handler when showNightModeButton is false', () => {
    let registered = false
    const app = createMockApp()
    app.registerPutHandler = () => {
      registered = true
    }

    pluginFactory(app).start({ showNightModeButton: false, apps: [] })
    assert.equal(registered, false)
  })

  it('PUT handler accepts valid mode values and emits delta', () => {
    const app = createMockApp()
    let emittedDelta: any = null
    app.handleMessage = (_id, delta) => {
      emittedDelta = delta
    }
    const handler = startWithPutHandler(app)

    const result = handler('vessels.self', 'environment.mode', 'night', () => {})
    assert.equal(result.state, 'COMPLETED')
    assert.equal(result.statusCode, 200)
    assert.equal(emittedDelta.updates[0].values[0].path, 'environment.mode')
    assert.equal(emittedDelta.updates[0].values[0].value, 'night')
  })

  it('PUT handler rejects invalid mode values', () => {
    const handler = startWithPutHandler(createMockApp())

    const result = handler('vessels.self', 'environment.mode', 'invalid', () => {})
    assert.equal(result.statusCode, 400)
  })
})

describe('dismiss-tour endpoint', () => {
  it('saves tourDismissed: true and responds', async () => {
    const app = createMockApp()
    let saved: any = null
    app.savePluginOptions = (options, cb) => {
      saved = options
      cb(null)
    }
    const plugin = pluginFactory(app)
    plugin.start({ apps: [], position: 'left' })

    const data = await request(registerRoutes(plugin).post['/dismiss-tour'])
    assert.equal(data.tourDismissed, true)
    assert.equal(saved.tourDismissed, true)
    assert.equal(saved.position, 'left')
  })

  it('keeps the saved configuration when the plugin is not running', async () => {
    const app = createMockApp()
    const apps = [{ url: '/a/', label: 'A', enabled: true }]
    app.readPluginOptions = () => ({ enabled: false, configuration: { position: 'right', apps } })
    let saved: any = null
    app.savePluginOptions = (options, cb) => {
      saved = options
      cb(null)
    }

    const data = await request(registerRoutes(pluginFactory(app)).post['/dismiss-tour'])
    assert.equal(data.tourDismissed, true)
    assert.deepEqual(saved, { position: 'right', apps, tourDismissed: true })
  })
})

describe('mode endpoint', () => {
  it('returns day when no mode is set', async () => {
    const data = await request(registerRoutes(pluginFactory(createMockApp())).get['/mode'])
    assert.equal(data.value, 'day')
  })

  it('returns current mode when set', async () => {
    const app = createMockApp()
    app.getSelfPath = (path) => (path === 'environment.mode' ? { value: 'night' } : null)
    const data = await request(registerRoutes(pluginFactory(app)).get['/mode'])
    assert.equal(data.value, 'night')
  })
})

describe('route access', () => {
  interface Registrar {
    get: (path: string) => void
    post: (path: string) => void
    access?: (level: string) => Registrar
  }

  // Records each route with the level it is registered at: 'admin' for a
  // route registered on the router itself, the access() level otherwise.
  function recordingRouter({ withAccess }: { withAccess: boolean }) {
    const levels: Record<string, string> = {}
    const registrar = (level: string): Registrar => ({
      get: (path) => {
        levels[`GET ${path}`] = level
      },
      post: (path) => {
        levels[`POST ${path}`] = level
      }
    })
    const router = registrar('admin')
    if (withAccess) router.access = registrar
    return { router, levels }
  }

  it('opens /settings and /mode to readonly users and /dismiss-tour to readwrite users', () => {
    const plugin = pluginFactory(createMockApp())
    const { router, levels } = recordingRouter({ withAccess: true })
    plugin.registerWithRouter(router)

    assert.deepEqual(levels, {
      'GET /settings': 'readonly',
      'GET /webapps': 'admin',
      'GET /mode': 'readonly',
      'POST /dismiss-tour': 'readwrite'
    })
  })

  it('registers every route on the router itself when it has no access()', () => {
    const plugin = pluginFactory(createMockApp())
    const { router, levels } = recordingRouter({ withAccess: false })
    plugin.registerWithRouter(router)

    assert.deepEqual(levels, {
      'GET /settings': 'admin',
      'GET /webapps': 'admin',
      'GET /mode': 'admin',
      'POST /dismiss-tour': 'admin'
    })
  })
})

describe('public files', () => {
  const publicDir = path.join(root, 'public')

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

  // The admin UI loads signalk.appIcon from the webapp's mount, public/; the
  // App Store loads it from the package root on unpkg. It has to be at both.
  it('signalk.appIcon resolves from the package root and from public/', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'))
    const icon = pkg.signalk.appIcon.replace(/^\.\//, '')
    assert.ok(fs.existsSync(path.join(root, icon)), 'at the package root')
    assert.ok(fs.existsSync(path.join(publicDir, icon)), 'in public/')
    assert.ok(pkg.files.includes(icon), 'published')
  })

  it('icon-settings.svg exists', () => {
    assert.ok(fs.existsSync(path.join(publicDir, 'icon-settings.svg')))
  })

  it('manifest.webmanifest exists and is valid JSON with required PWA fields', () => {
    const manifestPath = path.join(publicDir, 'manifest.webmanifest')
    assert.ok(fs.existsSync(manifestPath))
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    assert.equal(typeof manifest.name, 'string')
    assert.equal(typeof manifest.start_url, 'string')
    assert.equal(manifest.display, 'standalone')
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0)
  })

  it('app-icon-180.png exists (apple-touch-icon)', () => {
    assert.ok(fs.existsSync(path.join(publicDir, 'app-icon-180.png')))
  })

  it('app-icon-maskable.svg exists', () => {
    assert.ok(fs.existsSync(path.join(publicDir, 'app-icon-maskable.svg')))
  })
})
