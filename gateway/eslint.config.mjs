// @ts-check
import eslint from '@eslint/js';
import tslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';

/**
 * Lint du worker passerelle. Autonome (calqué sur les autres packages). Globals
 * de worker (fetch/Request/Response/URL) ; `tsc --noEmit` est la porte de types.
 */
export default tslint.config(
  { ignores: ['dist', 'node_modules', 'eslint.config.mjs', '.wrangler', '**/*.js'] },
  eslint.configs.recommended,
  ...tslint.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: { ...globals.serviceworker, ...globals.browser },
      sourceType: 'module',
    },
    rules: {
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
