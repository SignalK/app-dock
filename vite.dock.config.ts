import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import checker from 'vite-plugin-checker'

// The dock page (index.html) and the standalone configurator (config.html),
// built into public/, which signalk-server serves at /@signalk/app-dock/.
// Runs first and empties public/; the config panel build adds to it.
const here = path.dirname(fileURLToPath(import.meta.url))
const dock = (file: string) => path.resolve(here, 'src/dock', file)

export default defineConfig({
  root: dock('.'),
  // Relative URLs, so the pages work under the plugin's mount path.
  base: './',
  // With `root` set, Vite looks for public files under it; name the directory
  // explicitly. Its files (icons, manifest) are copied to public/ as they are.
  // app-icon.svg is not among them: it lives at the package root, where the
  // App Store fetches signalk.appIcon, and index.html's references to it
  // bring it into public/, where the admin UI fetches it.
  publicDir: dock('static'),
  plugins: [checker({ typescript: { tsconfigPath: dock('tsconfig.json') } })],
  build: {
    outDir: path.resolve(here, 'public'),
    emptyOutDir: true,
    target: 'es2022',
    modulePreload: false,
    // Every asset keeps its own file: the admin UI and the manifest load
    // app-icon.svg by name.
    assetsInlineLimit: 0,
    rollupOptions: {
      // The input names become the script names: dock.js and config.js.
      input: { dock: dock('index.html'), config: dock('config.html') },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: '[name][extname]'
      }
    }
  }
})
