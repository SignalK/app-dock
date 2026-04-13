# @signalk/app-dock

A macOS-style app dock for switching between Signal K webapps on touch screens.

![CI](https://github.com/SignalK/app-dock/actions/workflows/ci.yml/badge.svg)

## Features

- **macOS dock magnification** -- icons scale up with parabolic falloff as your finger moves along the dock
- **Frosted glass pill** with spring bounce animation, positioned on any screen edge
- **Lazy loading** -- apps load only when first tapped (important for Raspberry Pi and low-power devices)
- **Double-tap corner** to reveal the dock -- works on touch and mouse, no conflict with OS gestures or browser fullscreen
- **Mouse edge hover** to reveal on desktop
- **Autostart** -- optionally load a default app immediately on open
- **keep-alive or destroy** iframe lifecycle
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

**Double-tap** the configured screen corner (default: bottom-right) to open the dock. Tap an app icon to switch. The dock auto-dismisses after selection, or tap the backdrop to close it.

On desktop, move the mouse to the screen edge corresponding to the dock position.

## Configuration

Open **Plugin Config > App Dock** in the admin UI. The embedded configurator provides:

- **Discover** button to find all installed webapps (including Admin UI with a Settings gear icon)
- **Drag-to-reorder** the app list
- **Enable/disable** individual apps
- **Autostart** flag (play button) -- set one app to load automatically on open
- **Live dock preview**

### Settings

| Setting              | Default        | Description                                 |
| -------------------- | -------------- | ------------------------------------------- |
| `position`           | `bottom`       | Dock edge: `bottom`, `top`, `left`, `right` |
| `triggerCorner`      | `bottom-right` | Which corner activates double-tap           |
| `iframeMode`         | `keep-alive`   | `keep-alive` or `destroy`                   |
| `iconSize`           | `56`           | Base icon size in px                        |
| `magnification`      | `true`         | Enable macOS-style magnification effect     |
| `magnificationScale` | `1.7`          | Max icon scale (1.0-2.5)                    |

## Development

```bash
cd ~/.signalk
npm link /path/to/app-dock
```

Edit files in `public/`, reload the browser. No build step needed for the dock itself.

To rebuild the config panel (after changing `src/configpanel/`):

```bash
npm run build:config
```

### Scripts

| Command                | Description                       |
| ---------------------- | --------------------------------- |
| `npm test`             | Run tests                         |
| `npm run format`       | Prettier + ESLint fix             |
| `npm run lint`         | ESLint check                      |
| `npm run build:config` | Rebuild the admin UI config panel |

## License

Apache-2.0
