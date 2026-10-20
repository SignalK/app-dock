# @signalk/app-dock

A macOS-style app dock for switching between Signal K webapps on touch screens.

![CI](https://github.com/SignalK/app-dock/actions/workflows/ci.yml/badge.svg)

## Features

- **macOS dock magnification** -- icons scale up with parabolic falloff as your finger moves along the dock
- **Frosted glass pill** with spring bounce animation, positioned on any screen edge
- **Lazy loading** -- apps load only when first tapped (important for Raspberry Pi and low-power devices)
- **Double-tap anywhere** to reveal the dock -- works on touch and mouse. Single taps and clicks pass through to the underlying webapp unchanged, so interactive elements (e.g. KIP's corner widgets) keep working. The pass-through recurses into nested iframes too, so double-tap still opens the dock when one webapp embeds another (e.g. KIP's split view with Freeboard-SK).
- **Autostart** -- optionally load a default app immediately on open
- **keep-alive or destroy** iframe lifecycle
- **Night/day mode toggle** -- optional sun/moon button that flips `environment.mode` via a PUT handler
- **Fullscreen toggle** -- optional button that hides browser chrome via the Fullscreen API; feature-detected, so hidden on devices without API support (notably iPadOS Safari -- use Add to Home Screen there)
- **Installable as an app** -- ships a web app manifest and apple-touch-icon so iOS, Android, and desktop browsers can install the dock to the home screen and launch it in standalone mode (no browser chrome). Works over plain HTTP -- no SSL required
- **Active dot indicator**, label tooltip, haptic feedback
- **Embedded config panel** in the admin UI with webapp discovery, drag-to-reorder, and live preview

## Installation

```bash
cd ~/.signalk
npm install @signalk/app-dock
```

Restart Signal K, enable in **Plugin Config > App Dock**, click **Discover Installed Webapps**.

Open: `http://your-sk-server:3000/@signalk/app-dock/`

## Usage

**Double-tap anywhere** on the screen to open the dock. Tap an app icon to switch. Tap the icon of the app already on screen to reload it, for example after the app was updated on the server. The dock auto-dismisses after selection, or tap the backdrop to close it. Double-click works the same way for mouse users.

Tip: double-tapping a clickable element in the underlying webapp will activate that element once before the dock opens -- aim double-taps at non-interactive regions (maps, gauge backgrounds, empty space).

Config changes made in **Plugin Config** apply automatically within ~5 seconds: structural changes (position, icon size, etc.) reload the dock page; changes to the app list hot-update in place.

## Apps on another origin

The dock notices a double-tap by listening inside each app's page, and a browser allows that only for pages on the same origin (scheme, host and port) as the dock. A page from another port or host is out of reach: the app itself, a page the app moves its frame to (such as a radar display opened directly on its own server), or one the app shows in a frame of its own. While any such page in the app on screen does not forward its taps, a small tab at the dock's edge opens the dock with a single tap.

An app on another origin can bring back double-tap by forwarding its pointerdowns to the dock:

```js
if (window.self !== window.top) {
  document.addEventListener(
    'pointerdown',
    (e) => {
      window.top.postMessage(
        {
          type: 'signalk-app-dock:pointerdown',
          x: e.clientX,
          y: e.clientY,
          t: performance.timeOrigin + e.timeStamp
        },
        '*'
      )
    },
    { passive: true, capture: true }
  )
}
```

`t` is when the tap happened. It is optional, but a page that is busy, rendering a radar display for example, can post its messages late, and without `t` the dock can only go by when they arrive, which can split a double-tap in two.

The dock accepts these messages only from a page of the app on screen that it cannot listen to itself, or a frame inside that page, and all they do is count towards a double-tap. The tab goes away once every such page has sent one. A page that loads again starts over: the tab is back until its first tap.

## Install as an app

The dock ships a web app manifest, so iOS and Android can install it to the home screen and launch it like a native app -- no Safari/Chrome chrome, no URL bar.

- **iPad / iPhone (Safari)**: open the dock URL, tap the Share icon, choose **Add to Home Screen**.
- **Android (Chrome)**: open the dock URL, tap the ⋮ menu, choose **Install app** (or **Add to Home Screen**).
- **Desktop (Chrome, Edge)**: an install icon appears in the address bar; click it.

HTTPS is **not required** for Add-to-Home-Screen -- the dock installs cleanly over plain `http://your-sk-server:3000/`. It works equally over HTTPS with a self-signed or local-CA cert, provided the device has been configured to trust that CA (the usual iPad profile flow: Settings > General > VPN & Device Management > trust the profile > Settings > General > About > Certificate Trust Settings > enable full trust).

If the installed dock ever displays a blank screen after a long idle period (rare; only if the server's caching layer ignores the dock's `no-cache` directives), remove the home-screen icon and re-add it from Safari.

## Configuration

Open **Plugin Config > App Dock** in the admin UI. The embedded configurator provides:

- **Discover** button to find all installed webapps (including Admin UI with a Settings gear icon)
- **Drag-to-reorder** the app list
- **Enable/disable** individual apps
- **Autostart** flag (play button) -- set one app to load automatically on open
- **Live dock preview**

### Settings

| Setting                | Default   | Description                                                                                    |
| ---------------------- | --------- | ---------------------------------------------------------------------------------------------- |
| `position`             | `bottom`  | Dock edge: `bottom`, `top`, `left`, `right`                                                    |
| `iframeMode`           | `destroy` | `destroy` reloads an app each time it opens; `keep-alive` keeps hidden apps loaded and running |
| `iconSize`             | `56`      | Base icon size in px                                                                           |
| `magnification`        | `true`    | Enable macOS-style magnification effect                                                        |
| `magnificationScale`   | `1.7`     | Max icon scale (1.0-2.5)                                                                       |
| `showNightModeButton`  | `true`    | Show sun/moon button in dock; PUT-writes `environment.mode`                                    |
| `showFullscreenButton` | `false`   | Show fullscreen toggle in dock; hidden automatically where the Fullscreen API is unavailable   |
| `showExitButton`       | `false`   | Show X button that returns to the Signal K admin UI                                            |

In either `iframeMode`, the server's admin UI (an app whose URL is under `/admin/`, such as the Settings tile) opens fresh every time, at the URL its tile points to. A webapp or page opened from inside the admin UI does not come back the next time Settings is tapped.

## Access

With security enabled, what the dock offers depends on the visitor:

| Visitor                                        | Apps shown | Night-mode toggle | "Don't show again" in the tour |
| ---------------------------------------------- | ---------- | ----------------- | ------------------------------ |
| admin                                          | configured | yes               | yes                            |
| readwrite user                                 | configured | yes               | yes                            |
| readonly user                                  | configured | no                | no                             |
| not signed in, server allows read-only access  | configured | no                | no                             |
| not signed in, server refuses read-only access | built-in   | no                | no                             |

Visitors who are not admins reach the plugin's routes through `router.access()`, which signalk-server 2.31 added. On older servers they get the built-in list, the same apps the plugin seeds on its first start. Only admins can open **Plugin Config**, and "Don't show again" hides the tour for every visitor. Everyone who gets the configured apps can also read their URLs from the plugin's `/settings`, so keep credentials out of app URLs.

## Development

```bash
cd /path/to/app-dock
npm install
npm run build     # the server loads dist/ and serves public/; rebuild after a change

cd ~/.signalk     # or a throwaway SK config dir for dev, e.g. ~/.signalk-app-dock
npm link /path/to/app-dock
```

For side-by-side development without touching your real SK setup, point the server at a dedicated config dir:

```bash
PORT=4000 npm start -- -c ~/.signalk-app-dock
```

### Architecture

The repo ships three cooperating surfaces:

- **`src/plugin/`** -- the SK-server plugin, an ES module compiled by `tsc` to `dist/plugin/`. Defines the configuration schema with TypeBox, seeds default apps on first run, exposes HTTP endpoints for the dock and config panel, and owns the `environment.mode` PUT handler.
- **`src/dock/`** -- the dock UI (`index.html`, `dock.ts`, `dock.css`) and the standalone configurator (`config.html`, `config.ts`), built by Vite into `public/`, which the server serves at `/@signalk/app-dock/`. `src/dock/static/` holds the icons and the web manifest, copied as they are.
- **`src/configpanel/`** -- React 19 component exposed to the admin UI via Module Federation (`@module-federation/vite`), built into `public/remoteEntry.js` and `public/configpanel/`. It uses the admin UI's own React, which signalk-server 2.27 and later expose.

Everything is strict TypeScript. Vite only transpiles, so both Vite builds run the type checker (`vite-plugin-checker`) and fail on a type error. `public/` and `dist/` are build output and not committed; `npm run build` creates them.

### Scripts

| Command                    | Description                                                       |
| -------------------------- | ----------------------------------------------------------------- |
| `npm run build`            | Build the plugin, the dock pages and the config panel             |
| `npm run typecheck:config` | Type-check the Vite and ESLint configs                            |
| `npm run build:server`     | Compile the plugin and its tests to `dist/`                       |
| `npm run build:dock`       | Build the dock pages into `public/` (empties it first)            |
| `npm run build:config`     | Build the admin UI config panel into `public/`                    |
| `npm test`                 | Run the plugin tests (`node --test`) against `dist/`; build first |
| `npm run format`           | Prettier + ESLint fix                                             |
| `npm run format:check`     | Prettier check + ESLint, as CI runs them                          |
| `npm run lint`             | ESLint check                                                      |

### Icon assets

`app-icon.svg` has a transparent background: the artwork sits straight on whatever page shows it, so its colours have to read on light and dark backgrounds alike. Check a change on both before committing.

The 180-px apple-touch-icon needs an opaque background, because iOS fills transparency with black, and room for the corners iOS rounds off. Regenerate it from the SVG whenever that changes:

```bash
rsvg-convert -w 132 -h 132 app-icon.svg | magick - -background '#0f172a' -gravity center -extent 180x180 -alpha remove -alpha off PNG24:src/dock/static/app-icon-180.png
```

`src/dock/static/app-icon-maskable.svg` is hand-authored: the same artwork on the same dark slate, scaled into Android's 80% safe zone. Update it by hand when the artwork changes.

## License

Apache-2.0
