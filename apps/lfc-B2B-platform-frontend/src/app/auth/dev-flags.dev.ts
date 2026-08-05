/**
 * Drapeaux de développement — variante **DEV**, injectée par `fileReplacements`
 * dans la configuration `development` uniquement (`ng serve`, `ng build
 * --configuration development`). Jamais dans un build prod/cloudflare.
 */

/** Bypass d'auth DÉSACTIVÉ — on bosse toujours en flow réel (vrai login Auth0, même en dev). */
export const DEV_BYPASS_AUTH = false;
