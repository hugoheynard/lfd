// @ts-check
import eslint from "@eslint/js";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import globals from "globals";
import tseslint from "typescript-eslint";

const ENV_MSG =
  "Accès direct à l’environnement interdit : passer par AppConfig (src/infra/config/app-config.ts).";

/**
 * Seuls fichiers autorisés à lire l'environnement : la passerelle, son test,
 * et le harnais qui sème l'env des tests. Liste **explicite** (et non un glob
 * de dossier) pour qu'un futur fichier déposé dans src/infra/config n'hérite
 * pas de la dérogation par accident.
 */
const ENV_ALLOWLIST = [
  "src/platform/config/app-config.ts",
  // Les lecteurs, extraits d'app-config pour qu'il repasse sous 300 lignes.
  // Même discipline, même dossier — mais listé à la main, comme le reste.
  "src/platform/config/env-readers.ts",
  "src/platform/config/__tests__/app-config.spec.ts",
  // Même raison : il vérifie le LECTEUR qui a le monopole de `process.env`.
  "src/platform/config/__tests__/env-readers-r2.spec.ts",
  "test/setup-env.ts",
];

export default tseslint.config(
  {
    ignores: [
      "eslint.config.mjs",
      "src/platform/database/client/**",
      // Le second client Prisma, généré lui aussi — même raison, autre base.
      "src/pim/infra/database/client/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: "module",
      parserOptions: {
        project: ["./tsconfig.json", "./tsconfig.test.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // --- Typage strict, tenu par l'outil (cf. CLAUDE.md §6) --------------
      // Les trois règles étaient relâchées à l'amorçage du projet. Le code ne
      // les violait nulle part au moment du durcissement : passer en `error`
      // ne demandait aucun nettoyage, et empêche la dette d'entrer.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "prettier/prettier": ["error", { endOfLine: "auto" }],

      // --- L'environnement ne se lit QUE via AppConfig ---------------------
      // Sans ça, la passerelle serait contournée au premier oubli.
      "no-restricted-properties": [
        "error",
        { object: "process", property: "env", message: ENV_MSG },
      ],
      "no-restricted-syntax": [
        "error",
        // process['env'] — accès calculé
        {
          selector: "MemberExpression[object.name='process'][property.value='env']",
          message: ENV_MSG,
        },
        // `const p = process` ET `const { env } = process` :
        // interdire la liaison de `process` neutralise alias et déstructuration.
        {
          selector: "VariableDeclarator[init.name='process']",
          message: ENV_MSG,
        },
        // globalThis.process / global.process
        {
          selector:
            "MemberExpression[object.name=/^(globalThis|global)$/][property.name='process']",
          message: ENV_MSG,
        },
      ],
      // import { env } from 'node:process'
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "process", message: ENV_MSG },
            { name: "node:process", message: ENV_MSG },
          ],
        },
      ],
    },
  },
  {
    files: ENV_ALLOWLIST,
    rules: {
      "no-restricted-properties": "off",
      "no-restricted-syntax": "off",
      "no-restricted-imports": "off",
    },
  },
);
