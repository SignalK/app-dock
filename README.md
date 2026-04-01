# signalk-app-dock

A macOS-style configurable app dock for switching between Signal K webapps on touch screens.

## Features

- **macOS dock magnification** -- icons scale up with parabolic falloff as your finger moves along the dock, just like the real thing
- **Frosted glass pill** with spring bounce animation, positioned on any screen edge
- **Lazy loading** -- apps load only when first tapped, not pre-loaded (important for Raspberry Pi and low-power devices)
- **Two trigger modes** (configurable):
  - **Long-press corner** -- hold a screen corner for ~400 ms; doesn't conflict with KIP/Freeboard gestures
  - **Swipe from edge** -- swipe inward from the dock edge; uses a thin 18 px dead-zone strip with 48 px travel requirement
- **keep-alive or destroy** iframe lifecycle per your RAM budget
- **Active dot indicator**, label tooltip on press/hover, haptic feedback

## Installation

```bash
cd ~/.signalk
npm install signalk-app-dock
```

Restart Signal K, then enable in **Plugin Config > App Dock**.

Open: `http://your-sk-server:3000/signalk-app-dock/`

## Configuration

All settings are in **Plugin Config > App Dock**:

| Setting | Default | Description |
|---|---|---|
| `position` | `bottom` | Dock edge: `bottom`, `top`, `left`, `right` |
| `trigger` | `both` | `longpress`, `swipe`, or `both` |
| `triggerCorner` | `bottom-right` | Which corner activates long-press |
| `longPressDuration` | `400` | Hold time in ms |
| `iframeMode` | `keep-alive` | `keep-alive` or `destroy` |
| `iconSize` | `56` | Base icon size in px |
| `magnification` | `true` | Enable macOS-style magnification effect |
| `magnificationScale` | `1.7` | Max icon scale (1.0-2.5) |
| `apps` | KIP, Freeboard, Radar | Array of app definitions |

### App definition

```json
{
  "label": "KIP",
  "url": "/kip/",
  "icon": "/kip/assets/icon-72x72.png",
  "color": "#0d1b2a"
}
```

- `icon` -- emoji (e.g. `🧭`), image URL, or path to a webapp icon
- `color` -- CSS color for the icon background
- `url` -- any relative or absolute URL

## Gesture design

### Why long-press corner?

KIP uses swipe-up/down for dashboards, Freeboard uses pinch/pan for charts. A long-press in a screen corner is the only gesture guaranteed not to conflict. The corner is configurable.

### Why a thin swipe strip?

The swipe trigger only arms if the first touch lands within 18 px of the screen edge, requires 48 px of inward travel, and cancels if the touch drifts >60 px sideways. Normal panning and chart interaction won't trigger it.

## Development

```bash
cd ~/.signalk
npm link /path/to/signalk-app-dock
```

Edit files in `public/`, reload the browser. No build step needed.
