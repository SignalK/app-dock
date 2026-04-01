# signalk-app-dock

A macOS-style app dock for switching between Signal K webapps on touch screens.

![CI](https://github.com/dirkwa/signalk-app-dock/actions/workflows/ci.yml/badge.svg)

## Features

- **macOS dock magnification** -- icons scale up with parabolic falloff as your finger moves along the dock
- **Frosted glass pill** with spring bounce animation, positioned on any screen edge
- **Lazy loading** -- apps load only when first tapped (important for Raspberry Pi and low-power devices)
- **Touch + mouse triggers**:
  - **Long-press corner** -- hold a screen corner; doesn't conflict with KIP/Freeboard gestures
  - **Swipe from edge** -- thin 18 px dead-zone, 48 px travel
  - **Mouse edge hover** -- move cursor to screen edge (desktop)
- **keep-alive or destroy** iframe lifecycle
- **Active dot indicator**, label tooltip, haptic feedback
- **Embedded config panel** in the admin UI with webapp discovery, drag-to-reorder, and live preview

## Installation

```bash
cd ~/.signalk
npm install signalk-app-dock
```

Restart Signal K, enable in **Plugin Config > App Dock**, click **Discover Installed Webapps**.

Open: `http://your-sk-server:3000/signalk-app-dock/`

## Configuration

Open **Plugin Config > App Dock** in the admin UI. The embedded configurator provides:

- **Discover** button to find all installed webapps (including Admin UI with a Settings gear icon)
- **Drag-to-reorder** the app list
- **Enable/disable** individual apps
- **Live dock preview**
- All dock settings: position, trigger mode, corner, iframe lifecycle, icon size, magnification

### Settings

| Setting              | Default        | Description                                 |
| -------------------- | -------------- | ------------------------------------------- |
| `position`           | `bottom`       | Dock edge: `bottom`, `top`, `left`, `right` |
| `trigger`            | `both`         | `longpress`, `swipe`, or `both`             |
| `triggerCorner`      | `bottom-right` | Which corner activates long-press           |
| `longPressDuration`  | `400`          | Hold time in ms                             |
| `iframeMode`         | `keep-alive`   | `keep-alive` or `destroy`                   |
| `iconSize`           | `56`           | Base icon size in px                        |
| `magnification`      | `true`         | Enable macOS-style magnification effect     |
| `magnificationScale` | `1.7`          | Max icon scale (1.0-2.5)                    |

## Gesture design

KIP uses swipe-up/down for dashboards, Freeboard uses pinch/pan for charts. A long-press in a screen corner is the only gesture guaranteed not to conflict. The swipe trigger uses a thin 18 px edge strip with 48 px travel and cancels on >60 px lateral drift.

## Development

```bash
cd ~/.signalk
npm link /path/to/signalk-app-dock
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
