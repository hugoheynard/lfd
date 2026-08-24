// @ts-check
import eslint from '@eslint/js';
import tslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';

/**
 * Lint de l'admin B2B. Même forme que `@lfd/b2b-ui` — la présentation partagée
 * et l'app qui la consomme ne doivent pas obéir à deux règles différentes.
 *
 * Non type-checké ici : le `tsc --noEmit` et le build AOT sont la porte des
 * types, et les rejouer sous ESLint tripleraient le temps sans rien attraper de
 * neuf. Ce qui reste est ce que le compilateur NE dit pas : le `any`, le code
 * mort, les promesses lâchées.
 *
 * Les fichiers générés (`config:api`, `config:auth`) sont écrits par un script
 * au `postinstall` : les linter reviendrait à corriger la sortie plutôt que le
 * générateur.
 */
export default tslint.config(
  {
    ignores: [
      'node_modules',
      'dist',
      '.angular',
      'ios',
      'eslint.config.mjs',
      '**/*.js',
      '**/*.env.generated.ts',
    ],
  },
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

      // Le reste d'une déstructuration est notre façon de RETIRER une clé —
      // `exactOptionalPropertyTypes` distingue une clé absente d'une clé à
      // `undefined`, et c'est l'absence qu'on veut. La variable liée n'a pas
      // vocation à servir : c'est le tri qui compte.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { ignoreRestSiblings: true, argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // Une interface vide qui étend UN type est une augmentation de module —
      // la seule façon d'ajouter nos icônes à celles de fold. Elle ne déclare
      // rien parce qu'elle ne fait que nommer.
      '@typescript-eslint/no-empty-object-type': [
        'error',
        { allowInterfaces: 'with-single-extends' },
      ],
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
