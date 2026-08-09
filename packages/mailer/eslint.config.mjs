// @ts-check
import eslint from '@eslint/js';
import tslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';

/**
 * Lint pour `@lfd/mailer` — le transport e-mail transactionnel (Resend). Autonome (pas
 * de config partagée). Non type-checké : `tsc -b` est la porte de types, ESLint
 * n'interdit ici que les échappatoires porteuses (`any`, assertions de type) sur
 * le code de prod, pour qu'un DTO ne contourne jamais son schéma.
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
    ignores: ['**/*.spec.ts', '**/__tests__/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // Un client de transport doit typer le JSON non-typé rendu par `fetch`
      // (frontière serveur → T). Les assertions `as` y sont légitimes ; on
      // interdit seulement la forme sur littéral objet (masque un vrai mismatch).
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' },
      ],
    },
  },
  {
    files: ['**/*.spec.ts'],
    languageOptions: { globals: { ...globals.jest } },
    rules: {
      '@typescript-eslint/consistent-type-assertions': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
