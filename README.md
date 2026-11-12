# @signalk/app-dock

A macOS-style app dock for switching between Signal K webapps on touch screens.

![CI](https://github.com/SignalK/app-dock/actions/workflows/ci.yml/badge.svg)

## Features

- **Magnifying icons** -- icons grow as your finger moves along the dock, like the macOS dock
- **Frosted glass pill** with spring bounce animation, positioned on any screen edge
- **Lazy loading** -- apps load only when first tapped (important for Raspberry Pi and low-power devices)
- **Double-tap anywhere** to reveal the dock -- works on touch and mouse. Single taps and clicks pass through to the underlying webapp unchanged, so interactive elements (e.g. KIP's corner widgets) keep working. Double-tap also works when one webapp shows another inside it (e.g. KIP's split view with Freeboard-SK).
- **Autostart** -- optionally load a default app immediately on open
- **Keep apps running** in the background, or reload each app every time you open it
- **Night/day mode toggle** -- optional sun/moon button that switches every app that follows Signal K's day/night mode
- **Fullscreen toggle** -- optional button that hides the browser's address bar and tabs; not shown where the browser can't do it (notably Safari on iPad -- use Add to Home Screen there)
- **Installable as an app** -- add the dock to the home screen of an iPad, phone or computer and open it like any other app, without the browser around it. Works over plain HTTP
- **Active dot indicator**, label tooltip, haptic feedback
- **Setup in the admin UI** with webapp discovery, drag-to-reorder, and live preview

## Installation

In the Signal K admin UI, open **Appstore**, find **App Dock** and install it. Restart the server when asked. It comes with a starting set of apps, which you can change in **Plugin Config > App Dock**.

Open the dock at `http://your-sk-server:3000/@signalk/app-dock/`, or from the admin UI's **Webapps** page.

## Usage

**Double-tap anywhere** on the screen to open the dock. Tap an app icon to switch. Tap the icon of the app already on screen to reload it, for example after the app was updated on the server. The dock auto-dismisses after selection, or tap the backdrop to close it. Double-click works the same way for mouse users.

Tip: double-tapping a clickable element in the underlying webapp will activate that element once before the dock opens -- aim double-taps at non-interactive regions (maps, gauge backgrounds, empty space).

Some apps run on another address (another port or another device), a radar display for example. The dock cannot hear double-taps on those, so while one is on screen a small tab shows at the dock's edge: tap it once to open the dock.

Config changes made in **Plugin Config** apply automatically within ~5 seconds: structural changes (position, icon size, etc.) reload the dock page; changes to the app list hot-update in place.

## Install as an app

The dock ships a web app manifest, so iOS and Android can install it to the home screen and launch it like a native app -- no Safari/Chrome chrome, no URL bar.

- **iPad / iPhone (Safari)**: open the dock URL, tap the Share icon, choose **Add to Home Screen**.
- **Android (Chrome)**: open the dock URL, tap the ⋮ menu, choose **Install app** (or **Add to Home Screen**).
- **Desktop (Chrome, Edge)**: an install icon appears in the address bar; click it.

HTTPS is **not required** for Add-to-Home-Screen -- the dock installs cleanly over plain `http://your-sk-server:3000/`. It works equally over HTTPS with a self-signed or local-CA cert, provided the device has been configured to trust that CA (the usual iPad profile flow: Settings > General > VPN & Device Management > trust the profile > Settings > General > About > Certificate Trust Settings > enable full trust).

If the installed dock ever displays a blank screen after a long idle period (rare), remove the home-screen icon and re-add it from Safari.

## Configuration

Open **Plugin Config > App Dock** in the admin UI. The embedded configurator provides:

- **Discover** button to find all installed webapps (including the admin UI as a **More** tile, which opens the list of your other webapps and the server's settings)
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

In either `iframeMode`, the server's admin UI (an app whose URL is under `/admin/`, such as the More tile) opens fresh every time, at the URL its tile points to. A webapp or page opened from inside the admin UI does not come back the next time More is tapped.

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

## For webapp authors: apps on another origin

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

## Building from source

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache-2.0
