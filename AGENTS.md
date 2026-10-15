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
- **Taps pass through.** The double-tap listener is passive, never calls `preventDefault()`, and nothing covers an app
  except the small handle described below. It attaches to the dock document and, recursively, to every same-origin
  iframe document, so apps that embed other apps still open the dock.
- **Apps on another origin forward taps or get the handle.** The listeners cannot reach a page on another origin, whether
  it is the app itself or a frame inside the app. Such a page can post `{ type: 'signalk-app-dock:pointerdown', x, y }`
  to the dock (documented under **Apps on another origin** in `README.md`). `#dock-handle` shows while any unreachable
  frame in the active app has not sent its own message since it last loaded (one from a frame inside it does not count), and opens the dock with a single tap. The message
  handler accepts a message only from inside one of those frames, so no tap counts twice. Keep that check, the
  per-load reset and the coordinate check: a message must never do more than feed `handleTap()`.
- **Taps are timed by when they happened.** Every tap reaches `handleTap()` with its event time,
  `performance.timeOrigin + e.timeStamp` or a forwarded message's `t` (trusted only when it is a number no later than
  the message's arrival), and both coalescing windows compare event times too. A page busy rendering can have two
  taps handled back to back; timing them by handling splits the double-tap or drops the second tap as a duplicate.
- **One iframe sandbox string.** `switchToApp()` and the tour's Plugin Config link in `dock.js` create iframes with the
  same `sandbox` value; keep them identical. `allow-top-navigation-by-user-activation` is what lets a dock opened inside
  a dock break out to the top window (the guard at the top of `dock.js`).
- **The admin UI opens fresh.** `opensFresh()` in `dock.js` matches an app on the dock's origin whose path is under
  `/admin`. `switchToApp()` drops its frame and loads a new one each time its tile is tapped, in both iframe modes, so
  Settings never resumes a webapp or page opened inside it. Every other app follows `iframeMode`.
- **The active app's tile reloads it.** In keep-alive mode a frame lives as long as the dock page, so a webapp updated
  on the server would stay on its old version until the browser restarts. `switchToApp()` reloads the active app's frame
  at the page it is on (`reloadFrame()`); a frame on another origin starts over at the app's URL.
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
and the dock's own logo. Like every plugin logo here it has a transparent background: no tile behind the artwork, and
colours that read on light and dark pages. `public/app-icon-180.png` (apple-touch-icon) is generated from it onto an
opaque dark background, and `public/app-icon-maskable.svg` carries the same background and is maintained by hand; iOS
and Android both need an opaque icon. See **Icon assets** in `README.md`.

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
npm run format:check    # what CI runs: prettier --check + eslint
npm test
npm run build:config    # only when src/configpanel/ changed; commit the output
```

CI (`.github/workflows/ci.yml`) calls signalk-server's shared `plugin-ci.yml`: install, `npm test`, plugin lifecycle
and schema checks, npm-pack contents, an App Store style `--ignore-scripts` install, and `npm run format:check`, which
fails the build on any Prettier or ESLint finding.

Dependabot (`.github/dependabot.yml`) opens weekly grouped PRs for npm and GitHub Actions. A runtime dependency bump is
titled `fix(deps)` and releases; dev dependencies (`build(deps-dev)`) and actions (`ci`) do not.

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
  release PR merged before that still ships the change (the tag is on top of it) but its notes leave it out. Every run
  rebuilds it from `main` (`always-update` in `release-please-config.json`). Without that, a run that finds the same
  version and notes leaves the branch as it is, and a version change on `main` outside it, such as a hand-cut release,
  leaves it conflicting.
- **Betas come from the same release PR.** _Actions → release-please → Run workflow_ with `beta` turns it into the next
  beta of the version it proposes (`1.3.3` → `1.3.3-beta.1`, numbered after any beta of that version already tagged).
  Merging it tags `vX.Y.Z-beta.N`, makes a GitHub pre-release and publishes under the npm dist-tag `beta`; `latest`
  stays. While the last release is a beta, every releasable merge moves the release PR to the next beta (`-beta.2`; a
  `feat` moves it to the next minor's beta). _Run workflow_ with `stable` turns it into the stable release of that beta
  (`1.3.3-beta.2` → `1.3.3`), and refuses while `main` holds a change users get that was never in a beta. Both push an
  empty commit with a `Release-As:` footer to `main`. `refresh`, the default, only rebuilds the release PR. This is
  `versioning: prerelease` with `prerelease: true` in `release-please-config.json`; without it a `fix` after a beta
  would propose `1.3.4-beta.2`. Leave `prerelease-type` unset: with it, a stable version would bump to a beta too.
- **A tag pushed by hand still publishes** (`rc`, `alpha`, or a release outside release-please): `release_on_tag.yml`
  creates its Release and takes the npm dist-tag from the tag. After a stable release by hand, set
  `.release-please-manifest.json` to it, or the release PR proposes the same version again.

## File layout

| Path                          | Purpose                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `plugin/index.js`             | Plugin entry: schema, default-app seeding, routes, night-mode PUT handler.            |
| `public/index.html`           | Dock page: idle screen, handle, dock, backdrop, loading overlay, welcome tour.        |
| `public/dock.js`              | Dock logic: access detection, config loading and polling, iframes, double-tap, dock.  |
| `public/dock.css`             | Dock styling, magnification, positions.                                               |
| `public/manifest.webmanifest` | PWA manifest for Add to Home Screen.                                                  |
| `public/config.html`          | Older standalone configurator.                                                        |
| `src/configpanel/`            | React config panel for the admin UI (Module Federation remote).                       |
| `webpack.config.js`           | Builds `src/configpanel/` into `public/`; shares React as a singleton with the admin. |
| `test/plugin.test.js`         | Plugin tests (`node:test`).                                                           |
| `docs/screenshots/`           | App Store screenshots, listed in `package.json` under `signalk.screenshots`.          |
