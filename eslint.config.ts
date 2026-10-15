import { defineConfig, globalIgnores } from 'eslint/config'
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier/flat'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'

// ESLint loads this TypeScript config through its `jiti` peer dependency;
// there is no compile step.
export default defineConfig([
  globalIgnores(['dist', 'node_modules', 'public']),

  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended, prettier],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        // Type information for the rules below, from the tsconfig.json nearest
        // each file. The root configs are in no project's include list.
        projectService: { allowDefaultProject: ['vite.*.config.ts', 'eslint.config.ts'] },
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // A promise nobody awaits or handles fails silently: an unhandled fetch
      // in the dock, a save in the panel.
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          // node:test's describe() and it() return promises the runner tracks.
          allowForKnownSafeCalls: [{ from: 'package', name: ['describe', 'it'], package: 'node:test' }]
        }
      ],
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error'
    }
  },

  {
    files: ['src/dock/**/*.ts', 'src/configpanel/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser }
  },

  {
    files: ['src/configpanel/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended]
  },

  {
    // The tests drive the plugin through loosely typed mocks.
    files: ['src/test/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' }
  }
])
