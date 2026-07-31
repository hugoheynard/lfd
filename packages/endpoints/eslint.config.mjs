// @ts-check
import eslint from '@eslint/js';
import tslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';

/**
 * Lint pour `@lfd/endpoints` — le registre des ports/URLs dev. Autonome (pas de
 * config partagée), calqué sur `@lfd/contracts`. Non type-checké ici : `tsc -b`
 * est la porte de types ; ESLint n'interdit que les échappatoires (`any`,
 * assertions de type) pour que le registre reste des données pures et typées.
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
