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

**Double-tap anywhere** on the screen to open the dock. Tap an app icon to switch. The dock auto-dismisses after selection, or tap the backdrop to close it. Double-click works the same way for mouse users.

Tip: double-tapping a clickable element in the underlying webapp will activate that element once before the dock opens -- aim double-taps at non-interactive regions (maps, gauge backgrounds, empty space).

Config changes made in **Plugin Config** apply automatically within ~5 seconds: structural changes (position, icon size, etc.) reload the dock page; changes to the app list hot-update in place.

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

| Setting                | Default      | Description                                                                                      |
| ---------------------- | ------------ | ------------------------------------------------------------------------------------------------ |
| `position`             | `bottom`     | Dock edge: `bottom`, `top`, `left`, `right`                                                      |
| `iframeMode`           | `keep-alive` | `keep-alive` loads each app once and hides/shows (faster, more RAM); `destroy` reloads each time |
| `iconSize`             | `56`         | Base icon size in px                                                                             |
| `magnification`        | `true`       | Enable macOS-style magnification effect                                                          |
| `magnificationScale`   | `1.7`        | Max icon scale (1.0-2.5)                                                                         |
| `showNightModeButton`  | `true`       | Show sun/moon button in dock; PUT-writes `environment.mode`                                      |
| `showFullscreenButton` | `false`      | Show fullscreen toggle in dock; hidden automatically where the Fullscreen API is unavailable     |
| `showExitButton`       | `false`      | Show X button that returns to the Signal K admin UI                                              |

## Development

```bash
cd ~/.signalk     # or a throwaway SK config dir for dev, e.g. ~/.signalk-app-dock
npm link /path/to/app-dock
```

For side-by-side development without touching your real SK setup, point the server at a dedicated config dir:

```bash
PORT=4000 npm start -- -c ~/.signalk-app-dock
```

### Architecture

The repo ships three cooperating surfaces:

- **`plugin/index.js`** -- CommonJS SK-server plugin. Registers the schema, seeds default apps on first run, exposes HTTP endpoints for the dock and config panel, and owns the `environment.mode` PUT handler.
- **`public/dock.js` + `dock.css` + `index.html`** -- the dock UI itself. Plain JS, served as-is. **No build step**: edit and reload the browser.
- **`src/configpanel/`** -- React 19 component exposed to the admin UI via Webpack Module Federation. Rebuild with `npm run build:config` after changes here; output lands in `public/remoteEntry.js` and companion chunks.

### Scripts

| Command                | Description                                                       |
| ---------------------- | ----------------------------------------------------------------- |
| `npm test`             | Run plugin tests (`node --test`)                                  |
| `npm run format`       | Prettier + ESLint fix                                             |
| `npm run lint`         | ESLint check                                                      |
| `npm run build:config` | Rebuild the admin UI config panel (required after `src/` changes) |

### Icon assets

If `public/app-icon.svg` changes, regenerate the 180-px apple-touch-icon:

```bash
rsvg-convert -w 180 -h 180 public/app-icon.svg -o public/app-icon-180.png
```

`public/app-icon-maskable.svg` is a hand-authored wrapper that places the artwork inside Android's 80% safe zone; if the main icon's layout changes meaningfully, update it by hand to match.

## License

Apache-2.0
