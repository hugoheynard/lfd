/**
 * Version **production** du drapeau de bypass d'auth — toujours `false`.
 *
 * Le build de dev remplace ce fichier par `dev-flags.dev.ts` (fileReplacements,
 * cf. `angular.json`). Comme `DEV_BYPASS_AUTH` est une const de module, esbuild
 * la replie et **élimine** les branches de bypass du bundle prod (DCE) : le vrai
 * gate Auth0 est le seul chemin livré. Voir le front B2B pour le même pattern.
 */
export const DEV_BYPASS_AUTH = false;
