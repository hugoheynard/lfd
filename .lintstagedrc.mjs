/**
 * Ce qui passe au commit est FORMATÉ, et rien de plus.
 *
 * Prettier résout sa configuration **par fichier** : les deux frontends et
 * `@lfd/b2b-ui` ont leur propre `.prettierrc` (guillemets simples), le reste
 * suit celui de la racine. Un seul appel depuis la racine respecte donc les
 * quatre conventions sans avoir à les connaître.
 *
 * Pas d'ESLint ici, et c'est délibéré : il n'est installé que par paquet, et
 * il est type-aware sur `lfd-api` — le passer au commit coûterait des dizaines
 * de secondes et finirait contourné au `--no-verify`. Il reste en CI, où son
 * temps ne gêne personne.
 */
export default {
  "**/*.{js,mjs,cjs,ts,tsx,json,md,yml,yaml,scss,css,html}": ["pnpm exec prettier --write"],
};
