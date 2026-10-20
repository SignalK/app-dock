import { Type, type Static } from 'typebox'

// One definition is both the admin UI's configuration form (a TypeBox schema
// is JSON Schema at runtime) and the TypeScript type of the saved
// configuration. Every field is optional: a configuration saved by an older
// release, or by hand, may lack any of them.

export const AppEntrySchema = Type.Object({
  enabled: Type.Optional(Type.Boolean({ title: 'Enabled', default: true })),
  autostart: Type.Optional(
    Type.Boolean({
      title: 'Autostart',
      description: 'Load this app automatically when the dock page opens',
      default: false
    })
  ),
  url: Type.String({ title: 'URL' }),
  label: Type.Optional(Type.String({ title: 'Label override' })),
  icon: Type.Optional(Type.String({ title: 'Icon override', description: 'Emoji or image path' })),
  color: Type.Optional(Type.String({ title: 'Background color' }))
})

export const ConfigSchema = Type.Object(
  {
    position: Type.Optional(
      Type.Enum(['bottom', 'top', 'left', 'right'], { type: 'string', title: 'Dock position', default: 'bottom' })
    ),

    iframeMode: Type.Optional(
      Type.Enum(['keep-alive', 'destroy'], {
        type: 'string',
        title: 'iFrame lifecycle',
        description:
          'destroy: reload on every switch, so only the app on screen runs (slower switching, minimal RAM and CPU). ' +
          'keep-alive: load once and hide/show; hidden apps keep running (faster switching, more RAM and CPU).',
        default: 'destroy'
      })
    ),

    iconSize: Type.Optional(Type.Number({ title: 'Icon size (px)', default: 56 })),

    magnification: Type.Optional(Type.Boolean({ title: 'Enable dock magnification effect', default: true })),

    magnificationScale: Type.Optional(
      Type.Number({ title: 'Magnification scale (1.0 = none, 2.5 = maximum)', default: 1.7 })
    ),

    showNightModeButton: Type.Optional(
      Type.Boolean({
        title: 'Show night/day mode toggle',
        description: 'Adds a sun/moon button to the dock that toggles environment.mode',
        default: true
      })
    ),

    showFullscreenButton: Type.Optional(
      Type.Boolean({
        title: 'Show fullscreen toggle',
        description:
          'Adds a button to the dock that toggles browser fullscreen. ' +
          'Hidden automatically when the Fullscreen API is not available (e.g. iPadOS Safari — use Add to Home Screen instead).',
        default: false
      })
    ),

    showExitButton: Type.Optional(
      Type.Boolean({
        title: 'Show exit button',
        description: 'Adds an X button to the dock that returns to Signal K admin UI',
        default: false
      })
    ),

    tourDismissed: Type.Optional(
      Type.Boolean({
        title: 'Welcome tour dismissed',
        description:
          'Set automatically when a user clicks "Don\'t show again" in the welcome tour. Uncheck to show the tour again on all devices.',
        default: false
      })
    ),

    apps: Type.Optional(
      Type.Array(AppEntrySchema, {
        title: 'Dock Apps',
        description:
          'Installed webapps are added here automatically. Reorder, disable, or override labels/icons as needed.',
        default: []
      })
    )
  },
  {
    description:
      'Open /@signalk/app-dock/config.html for the visual configurator with discover button and drag-to-reorder.'
  }
)

export type AppEntry = Static<typeof AppEntrySchema>
export type Config = Static<typeof ConfigSchema>
export type DockPosition = NonNullable<Config['position']>
export type IframeMode = NonNullable<Config['iframeMode']>

// An enabled app as /settings serves it to the dock.
export interface ResolvedApp {
  label: string
  url: string
  icon: string | null
  color: string | null
  autostart: boolean
}

// The configuration with the enabled apps resolved: what /settings serves.
export type SharedSettings = Omit<Config, 'apps'> & { apps: ResolvedApp[] }

// An installed webapp as /webapps serves it.
export interface DiscoveredWebapp {
  name: string
  label: string
  url: string
  icon: string | null
}
