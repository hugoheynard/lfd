/**
 * Drapeaux de développement — variante **DEV**, injectée par `fileReplacements`
 * dans la configuration `development` uniquement (`ng serve`, `ng build
 * --configuration development`). Jamais dans un build prod/cloudflare.
 */

/**
 * Bypass d'auth **ACTIF** en développement.
 *
 * Il a longtemps valu `false` — « on bosse toujours en flow réel ». Ce n'est
 * plus tenable depuis que la boutique montre un vrai compte : sans session, elle
 * affiche « Compte non reconnu » partout, et obtenir cette session demandait de
 * passer par Auth0 à chaque poste, à chaque profil de navigateur, pour regarder
 * un écran.
 *
 * ## Ce que ça branche exactement
 *
 * L'app se déclare authentifiée et envoie le jeton factice
 * `dev-impersonation` ; l'API l'ignore et résout l'utilisateur désigné par
 * `AUTH_DEV_IMPERSONATE_SUBJECT` (un e-mail ou un `auth0_sub`) — c'est-à-dire
 * celui que le seed a posé. Les deux moitiés doivent être allumées : ce drapeau
 * seul ferait partir des appels que l'API refuserait.
 *
 * ⚠️ **Rien de tout cela n'atteint la production** : ce fichier n'y est pas
 * compilé (`fileReplacements`), et `DEV_BYPASS_AUTH` y vaut `false` en tête de
 * chaque `&&`, ce qu'esbuild plie — la branche de bypass est absente du bundle,
 * pas seulement gardée. Côté API, le drapeau refuse de démarrer avec
 * `NODE_ENV=production`.
 */
export const DEV_BYPASS_AUTH = true;
