/**
 * Version **dev** du drapeau de bypass d'auth — `true`.
 *
 * Substitué à `dev-flags.ts` par la configuration `development` d'`angular.json`
 * (fileReplacements). En bypass, le shell se considère authentifié SANS Auth0
 * (le SDK n'est même pas fourni) : pratique tant que le `clientId` de la SPA
 * Suite n'est pas renseigné. JAMAIS livré en prod (ce fichier n'entre que par le
 * remplacement de dev).
 */
export const DEV_BYPASS_AUTH = true;
