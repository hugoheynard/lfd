// @ts-check
import eslint from '@eslint/js';
import tslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';

/**
 * Lint pour `@lfd/suite-embed` — le contrat postMessage de la suite. Autonome,
 * calqué sur `@lfd/endpoints`. Non type-checké ici : `tsc -b` est la porte de
 * types ; ESLint interdit les échappatoires (`any`, assertions) pour que les
 * gardes de type restent honnêtes.
 */
export default tslint.config(
  { ignores: ['dist', 'node_modules', 'eslint.config.mjs', '**/*.js'] },
  eslint.configs.recommended,
  ...tslint.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'module',
    },
    rules: {
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
    },
  },
);
