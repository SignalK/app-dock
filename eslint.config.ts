import { defineConfig, globalIgnores } from 'eslint/config'
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier/flat'
import globals from 'globals'

// ESLint loads this TypeScript config through its `jiti` peer dependency;
// there is no compile step.
export default defineConfig([
  globalIgnores(['dist', 'node_modules', 'src/configpanel', 'public/*', '!public/dock.js']),

  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended, prettier],
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  },

  {
    // The tests drive the plugin through loosely typed mocks.
    files: ['src/test/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' }
  },

  {
    files: ['public/dock.js'],
    extends: [js.configs.recommended, prettier],
    languageOptions: { sourceType: 'script', globals: globals.browser },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  }
])
