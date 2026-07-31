/**
 * Drapeaux de développement — variante **DEV**, injectée par `fileReplacements`
 * dans la configuration `development` uniquement (`ng serve`, `ng build
 * --configuration development`). Jamais dans un build prod/cloudflare.
 */

/** Bypass d'auth ACTIF en dev — reste combiné à un contrôle localhost dans `AuthFacade`. */
export const DEV_BYPASS_AUTH = true;
