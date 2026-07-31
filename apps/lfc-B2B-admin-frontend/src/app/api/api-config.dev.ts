import { DEV_URLS } from '@lfd/endpoints';

/**
 * Base de l'API B2B — version **DEV** (localhost). Substituée à `api-config.ts`
 * par la configuration `development` d'angular.json.
 *
 * Le port n'est PAS écrit ici : il vient du registre unique `@lfd/endpoints`
 * (le même que le CORS dev du backend B2B, qui autorise déjà l'origine de cette
 * app admin).
 */
export const B2B_API_BASE = DEV_URLS.b2bBack;
