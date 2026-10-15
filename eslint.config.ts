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
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  },

  {
    files: ['src/dock/**/*.ts', 'src/configpanel/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser }
  },

  {
    files: ['src/configpanel/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules
  },

  {
    // The tests drive the plugin through loosely typed mocks.
    files: ['src/test/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' }
  }
])
