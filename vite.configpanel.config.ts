import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { federation } from '@module-federation/vite'
import react from '@vitejs/plugin-react'
import checker from 'vite-plugin-checker'
import packageJson from './package.json' with { type: 'json' }

// The config panel the admin UI loads through Module Federation, as
// public/remoteEntry.js. Runs after the dock build, which empties public/.
const here = path.dirname(fileURLToPath(import.meta.url))
const shim = (file: string) => path.resolve(here, 'src/configpanel/host-shim', file)

export default defineConfig({
  // The panel uses the admin UI's own React: each import of react,
  // react-dom or the JSX runtime resolves to a shim that re-exports the
  // instance signalk-server 2.27 and later put on window. A second React
  // copy in the bundle would have hooks call into a dispatcher that was
  // never activated.
  resolve: {
    alias: [
      { find: /^react\/jsx-(dev-)?runtime$/, replacement: shim('react-jsx-runtime.ts') },
      { find: 'react-dom/client', replacement: shim('react-dom-client.ts') },
      { find: /^react-dom$/, replacement: shim('react-dom.ts') },
      { find: /^react$/, replacement: shim('react.ts') }
    ]
  },
  plugins: [
    react(),
    checker({ typescript: { tsconfigPath: 'src/configpanel/tsconfig.json' } }),
    federation({
      name: packageJson.name.replace(/[-@/]/g, '_'),
      filename: 'remoteEntry.js',
      exposes: {
        './PluginConfigurationPanel': './src/configpanel/PluginConfigurationPanel.tsx'
      },
      // react and react-dom are aliased to the host above, so nothing is
      // shared through the federation scope.
      shared: {},
      // The host reads the container global at runtime and never our types.
      dts: false
    })
  ],
  build: {
    outDir: 'public',
    emptyOutDir: false,
    target: 'es2022',
    modulePreload: false,
    cssCodeSplit: false,
    rollupOptions: {
      input: './src/configpanel/PluginConfigurationPanel.tsx',
      preserveEntrySignatures: 'exports-only',
      output: {
        format: 'esm',
        entryFileNames: 'configpanel/[name].js',
        chunkFileNames: 'configpanel/[name]-[hash].js',
        assetFileNames: 'configpanel/[name]-[hash][extname]'
      }
    }
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production')
  }
})
