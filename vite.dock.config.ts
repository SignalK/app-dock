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
  publicDir: dock('static'),
  plugins: [checker({ typescript: { tsconfigPath: dock('tsconfig.json') } })],
  build: {
    outDir: path.resolve(here, 'public'),
    emptyOutDir: true,
    target: 'es2022',
    modulePreload: false,
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
