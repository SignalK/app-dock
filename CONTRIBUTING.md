# Contributing to App Dock

How to build App Dock from source and work on it. For using the dock, see [README.md](README.md); the rules a change has to keep are in [AGENTS.md](AGENTS.md).

## Development setup

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

## Architecture

The repo ships three cooperating surfaces:

- **`src/plugin/`** -- the SK-server plugin, an ES module compiled by `tsc` to `dist/plugin/`. Defines the configuration schema with TypeBox, seeds default apps on first run, exposes HTTP endpoints for the dock and config panel, and owns the `environment.mode` PUT handler.
- **`src/dock/`** -- the dock UI (`index.html`, `dock.ts`, `dock.css`) and the standalone configurator (`config.html`, `config.ts`), built by Vite into `public/`, which the server serves at `/@signalk/app-dock/`. `src/dock/static/` holds the icons and the web manifest, copied as they are.
- **`src/configpanel/`** -- React 19 component exposed to the admin UI via Module Federation (`@module-federation/vite`), built into `public/remoteEntry.js` and `public/configpanel/`. It uses the admin UI's own React, which signalk-server 2.27 and later expose.

Everything is strict TypeScript. Vite only transpiles, so both Vite builds run the type checker (`vite-plugin-checker`) and fail on a type error. `public/` and `dist/` are build output and not committed; `npm run build` creates them.

## Scripts

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

## Icon assets

`app-icon.svg` has a transparent background: the artwork sits straight on whatever page shows it, so its colours have to read on light and dark backgrounds alike. Check a change on both before committing.

The 180-px apple-touch-icon needs an opaque background, because iOS fills transparency with black, and room for the corners iOS rounds off. Regenerate it from the SVG whenever that changes:

```bash
rsvg-convert -w 132 -h 132 app-icon.svg | magick - -background '#0f172a' -gravity center -extent 180x180 -alpha remove -alpha off PNG24:src/dock/static/app-icon-180.png
```

`src/dock/static/app-icon-maskable.svg` is hand-authored: the same artwork on the same dark slate, scaled into Android's 80% safe zone. Update it by hand when the artwork changes.
