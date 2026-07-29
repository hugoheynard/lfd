// @ts-check
import eslint from '@eslint/js';
import tslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';

/**
 * Lint for `@lfd/storage` — the storage core (S3/R2 adapter + primitives).
 * Self-contained (no shared config package). Non-type-checked: `tsc -b` is the
 * type gate, ESLint here only enforces the load-bearing bans (`any`, type
 * assertions) on production code so a hostile object store or a mis-typed key
 * can't slip through an escape hatch. Tests may keep assertions for SDK mocks.
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
  // ── Production src: no escape hatches ──
  {
    files: ['src/**/*.ts'],
    ignores: ['**/*.spec.ts', '**/__tests__/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'never' },
      ],
    },
  },
  // ── Specs: SDK mocks need assertions + any ──
  {
    files: ['**/*.spec.ts'],
    languageOptions: { globals: { ...globals.jest } },
    rules: {
      '@typescript-eslint/consistent-type-assertions': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
