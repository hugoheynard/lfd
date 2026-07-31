import { DEV_URLS } from '@lfd/endpoints';

/**
 * URLs des apps hostées — version **DEV** (localhost). Substituée à
 * `suite-config.ts` par la configuration `development` d'angular.json.
 *
 * Le port PIM n'est PAS écrit ici : il vient du registre unique `@lfd/endpoints`
 * (le même que les CORS dev du backend PIM), pour qu'un changement de port ne se
 * fasse qu'à un seul endroit.
 */
export const SUITE_APP_URLS: Readonly<Record<string, string>> = {
  pim: DEV_URLS.pimFront,
};
