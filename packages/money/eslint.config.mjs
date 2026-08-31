// @ts-check
import eslint from "@eslint/js";
import tslint from "typescript-eslint";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import globals from "globals";

/**
 * Lint pour `@lfd/money` — l’arithmétique exacte de l’argent (rationnels en
 * `bigint`). Autonome, sans dépendance. Non type-checké : `tsc -b` est la porte
 * de types ; ESLint n’interdit ici que les échappatoires porteuses (`any`,
 * assertions) sur le code de prod, pour qu’un calcul d’argent ne triche jamais.
 */
export default tslint.config(
  { ignores: ["dist", "node_modules", "eslint.config.mjs", "**/*.js"] },
  eslint.configs.recommended,
  ...tslint.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: { ...globals.node },
      sourceType: "module",
    },
    rules: {
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
  {
    files: ["src/**/*.ts"],
    ignores: ["**/*.spec.ts", "**/__tests__/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }],
    },
  },
  {
    files: ["**/*.spec.ts"],
    languageOptions: { globals: { ...globals.jest } },
    rules: {
      "@typescript-eslint/consistent-type-assertions": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
