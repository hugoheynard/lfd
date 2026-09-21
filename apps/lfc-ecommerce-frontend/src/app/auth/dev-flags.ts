/**
 * Drapeaux de développement — **valeurs de PRODUCTION** (le défaut sûr).
 *
 * Ce fichier est remplacé au build par `dev-flags.dev.ts` **uniquement** dans la
 * configuration `development` (voir `angular.json` → `fileReplacements`, le même
 * mécanisme que les `environment.ts`). Les builds `production` et `cloudflare`
 * gardent donc CE fichier : `DEV_BYPASS_AUTH` y vaut `false`, et le compilateur
 * élimine la branche de bypass du bundle. Impossible d'expédier le bypass en
 * ligne — ce n'est pas seulement gardé à l'exécution, c'est absent du bundle.
 */

/** Bypass d'authentification. `false` en prod ; voir `dev-flags.dev.ts` pour le dev. */
export const DEV_BYPASS_AUTH = false;
