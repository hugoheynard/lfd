// @ts-check
import eslint from '@eslint/js';
import tslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';

/**
 * Lint pour `@lfd/b2b-ui` — composants de présentation partagés. Autonome, non
 * type-checké ici (le build AOT de chaque app est la porte de types). On garde
 * l'interdiction du `any` ; on autorise les assertions de type que le code
 * Angular exige (ex. `event.target as HTMLInputElement`), contrairement aux
 * packages de contrats purs.
 */
export default tslint.config(
  { ignores: ['node_modules', 'eslint.config.mjs', '**/*.js'] },
  eslint.configs.recommended,
  ...tslint.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: { ...globals.browser },
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
    },
  },
);
