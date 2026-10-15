// The icons of the dock's own buttons (night mode, fullscreen, exit), drawn as
// inline SVG so they need no font. A minimal Linux kiosk often has no colour
// emoji font, and the emoji these buttons used rendered there as empty
// squares. Each icon is stroked in its button's text colour (currentColor) and
// fills the box its container gives it.
//
// Static markup only: the strings are set as innerHTML by the dock and the
// config panel's preview, so nothing from outside may ever be put in them.

const svg = (name: string, body: string) =>
  `<svg class="dock-svg-icon dock-svg-${name}" width="100%" height="100%" viewBox="0 0 24 24" fill="none" ` +
  `stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`

export const ICONS = {
  sun: svg(
    'sun',
    '<circle cx="12" cy="12" r="4"/>' +
      '<path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
  ),
  moon: svg('moon', '<path d="M20.5 14A9 9 0 1 1 10 3.5a7.5 7.5 0 0 0 10.5 10.5z"/>'),
  fullscreen: svg('fullscreen', '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>'),
  exitFullscreen: svg('exit-fullscreen', '<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/>'),
  close: svg('close', '<path d="M6 6l12 12M18 6L6 18"/>')
} as const

export type IconName = keyof typeof ICONS
