# @signalk/app-dock

A Signal K server plugin plus webapp: a macOS-style dock for switching between Signal K webapps on touch screens. The
dock page holds each app in an iframe, and a double-tap anywhere brings up the dock. User-facing behaviour is documented
in `README.md`; this file covers what a contributor needs to keep intact.

## Architecture

Three surfaces ship together from one package:

- **`plugin/index.js`**: the server plugin (CommonJS). It holds the schema, seeds the default apps on first start, serves
  the dock's HTTP routes, and registers the `environment.mode` PUT handler for the night-mode button.
- **`public/dock.js`, `dock.css`, `index.html`**: the dock itself, served as-is at `/@signalk/app-dock/`. Plain browser
  JavaScript with **no build step**: edit and reload.
- **`src/configpanel/`**: the React 19 config panel that the admin UI loads through Webpack Module Federation (keyword
  `signalk-plugin-configurator`). `npm run build:config` writes `public/remoteEntry.js` and its chunks.

`public/config.html` is an older standalone configurator that the schema description links to; the admin UI shows the
React panel.

## Rules to keep in mind

- **Seed once, never rewrite.** `start()` seeds `DEFAULT_APPS` only when the saved `apps` is not an array. An app list
  that already exists, even an empty one, is the user's and is never changed.
- **The default app list lives in three places.** `DEFAULT_APPS` in `plugin/index.js`, `NO_ADMIN_DEFAULTS` in
  `public/dock.js` (served to visitors the plugin's `/settings` refuses), and the welcome-tour text in
  `public/index.html`. Change them together.
- **`savePluginOptions` replaces the whole saved configuration.** Build every save from a complete configuration
  (`running ? pluginSettings : savedSettings()`), never from a partial object.
- **Routes must work while the plugin is stopped.** signalk-server registers the router of every loaded plugin, enabled
  or not. A handler that needs the configuration reads `app.readPluginOptions()` when `running` is false.
- **Access is opt-in per route.** Routes on `router` are admin-only. `router.access('readonly' | 'readwrite')`
  (signalk-server 2.31 and later) opens a route to more users; feature-detect it (`typeof router.access === 'function'`)
  so older servers keep working admin-only. `/config` stays admin-only on every server. When access changes, update the
  access detection at the top of `dock.js` and the **Access** table in `README.md` with it.
- **`/settings` is readable by every visitor with read access.** Never put credentials or anything secret in it; that
  includes app URLs.
- **Taps pass through.** The double-tap listener is passive, never calls `preventDefault()`, and there is no overlay
  element. It attaches to the dock document and, recursively, to every same-origin iframe document, so apps that embed
  other apps still open the dock.
- **One iframe sandbox string.** `switchToApp()` and the tour's Plugin Config link in `dock.js` create iframes with the
  same `sandbox` value; keep them identical. `allow-top-navigation-by-user-activation` is what lets a dock opened inside
  a dock break out to the top window (the guard at the top of `dock.js`).
- **Live config reload.** The dock polls the plugin every 5 s. A setting that changes how the dock is built belongs in
  `STRUCTURAL_KEYS` in `dock.js` (the page reloads); app-list changes rebuild the dock in place.
- **New settings touch four places:** the schema in `plugin/index.js`, `DEFAULTS` in `dock.js`, the config panel in
  `src/configpanel/`, and the **Settings** table in `README.md`.
- **Browser globals are declared.** ESLint lints `dock.js` as a classic script with an explicit globals list in
  `eslint.config.js`; add a browser API there when `dock.js` starts using it.

## Build output is committed

`public/remoteEntry.js`, `public/main.js`, `public/540.js`, `public/805.js` and `public/540.js.LICENSE.txt` are Webpack
output and are tracked in git. After changing `src/configpanel/`, run `npm run build:config` and commit the regenerated
files with the source change. `prepublishOnly` rebuilds them at publish time. Prettier and ESLint skip them, and ESLint
also skips `src/`.

## What the npm package ships

`files` in `package.json` is an allowlist: `plugin/`, `public/` and `docs/screenshots/`, plus the README, LICENSE and
`package.json` that npm always adds. A file the plugin or the dock needs at runtime has to live in one of those
directories or be added to the list. Nothing outside it is published, and a missing file shows up only in an installed
copy, not in a checkout. `docs/screenshots/` must stay: `signalk.screenshots` points there, and the App Store and the
plugin registry read them from the package. Check with `npm pack --dry-run`.

## Icons

`public/app-icon.svg` is the source icon: the `signalk.appIcon` shown by the admin UI and the App Store, the favicon,
and the dock's own logo. `public/app-icon-180.png` (apple-touch-icon) is generated from it and
`public/app-icon-maskable.svg` is maintained by hand; see **Icon assets** in `README.md`.

## Tests

`npm test` runs `test/plugin.test.js` with `node:test` against a mock `app` (`createMockApp()`). Cover new routes,
settings and seeding behaviour there. `dock.js` has no automated tests; check dock changes in a browser against a
running server (see **Development** in `README.md`).

## Workflow conventions

This repo is maintained by Dirk Wahrheit.

- Branch names use **hyphens**, never slashes.
- Angular conventional commits: `<type>(<scope>): <subject>`. PR titles use the same format; the generated release
  notes are built from them.
- The PR title's type also picks its section in the release notes. `.github/workflows/label-by-title.yml` labels each
  PR when it is opened or its title edited: `feat`/`perf` → `enhancement` (🚀 Features), `fix` → `bug` (🐛 Fixes),
  `docs` → `documentation` (📖 Documentation), `build`/`ci`/`test`/`chore`/`refactor`/`style` → `skip-changelog`
  (left out). Any other type lands under Other. A label set by hand stays until the title is next edited. Keep the
  workflow and `.github/release.yml` naming the same labels.
- One logical change per commit.
- No `Co-Authored-By` lines. No "Generated with Claude Code" attribution.
- Never commit directly to `main`. Every change goes through a PR.
- PR descriptions: no checkboxes. "Tested" lists what actually ran, not what was planned.
- No hand-written CHANGELOG; GitHub Releases carry generated notes.

### Before opening a PR

```bash
npm run format          # prettier --write + eslint --fix
npm run lint
npm test
npm run build:config    # only when src/configpanel/ changed; commit the output
```

CI (`.github/workflows/ci.yml`) calls signalk-server's shared `plugin-ci.yml`: install, `npm test`, plugin lifecycle
and schema checks, npm-pack contents, and an App Store style `--ignore-scripts` install. It does **not** run Prettier or
ESLint, so run them locally.

### Releases

Releases are cut by release-please. Every releasable push to `main` updates a standing release PR titled
`chore(release): X.Y.Z` that bumps `version` in `package.json` and `package-lock.json`. Merging it creates the tag and
the GitHub Release, and `.github/workflows/release-please.yml` then dispatches `release_on_tag.yml` on the tag, which
publishes to npm with provenance (OIDC trusted publishing, no token).

- **The version follows the commits:** `feat` → minor, `fix`, `perf` and `revert` → patch, `!` or a
  `BREAKING CHANGE:` footer → major. A `Release-As: X.Y.Z` footer overrides it. Do not bump the version in an ordinary
  PR.
- **A push with nothing releasable leaves the release PR alone.** The `gate` job in `release-please.yml` decides what
  counts; its comment lists the cases. Revert with a conventional `revert:` subject, since release-please ignores
  GitHub's `Revert "…"`. Change the gate's last alternative together with `pull-request-title-pattern` in
  `release-please-config.json`, or the release PR's merge never creates a tag.
- **Merge the release PR once it lists your change.** release-please refreshes it a moment after each merge; a
  release PR merged before that still ships the change (the tag is on top of it) but its notes leave it out.
- **Pre-releases are cut by hand:** a `chore(release): X.Y.Z-beta.N` PR, then an annotated tag `vX.Y.Z-beta.N` pushed
  on its merge commit. `release_on_tag.yml` creates their Release itself and publishes under the npm dist-tag `alpha`,
  `beta` or `rc` that the tag contains.

## File layout

| Path                          | Purpose                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `plugin/index.js`             | Plugin entry: schema, default-app seeding, routes, night-mode PUT handler.            |
| `public/index.html`           | Dock page: idle screen, dock, backdrop, loading overlay, welcome tour.                |
| `public/dock.js`              | Dock logic: access detection, config loading and polling, iframes, double-tap, dock.  |
| `public/dock.css`             | Dock styling, magnification, positions.                                               |
| `public/manifest.webmanifest` | PWA manifest for Add to Home Screen.                                                  |
| `public/config.html`          | Older standalone configurator.                                                        |
| `src/configpanel/`            | React config panel for the admin UI (Module Federation remote).                       |
| `webpack.config.js`           | Builds `src/configpanel/` into `public/`; shares React as a singleton with the admin. |
| `test/plugin.test.js`         | Plugin tests (`node:test`).                                                           |
| `docs/screenshots/`           | App Store screenshots, listed in `package.json` under `signalk.screenshots`.          |
