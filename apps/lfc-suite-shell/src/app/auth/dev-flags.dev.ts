/**
 * Version **dev** du drapeau de bypass d'auth — `false`.
 *
 * Désormais on bosse **toujours en flow réel** : même en dev, le shell fait le
 * vrai login Auth0 (SPA « LFC Suite » sur le tenant lafoliedouce.eu). Le
 * mécanisme de remplacement (`fileReplacements`, cf. `angular.json`) reste en
 * place — seule la valeur change — pour pouvoir ré-armer un bypass ponctuel si
 * besoin, sans toucher au câblage. Prérequis dev : un `.env` avec le `clientId`
 * et les audiences (cf. `.env.example`), + `http://localhost:7300` en callback Auth0.
 */
export const DEV_BYPASS_AUTH = false;
