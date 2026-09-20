import { DEV_URLS, GATEWAY_URLS, isViaGateway } from '@lfd/endpoints';

/**
 * Base de l'API B2B — version **DEV**. Substituée à `api-config.ts` par la
 * configuration `development` d'angular.json.
 *
 * **Gateway-aware** : servie via la passerelle (`b2b-admin.localhost:8787`), l'app
 * appelle `api-b2b.localhost:8787` (tout passe par le gateway, cross-origin) ; en
 * direct, `localhost:3200`. Le CORS du backend autorise les deux (cf. registre).
 */
const viaGateway = typeof window !== 'undefined' && isViaGateway(window.location.hostname);

export const B2B_API_BASE = viaGateway ? GATEWAY_URLS.b2bBack : DEV_URLS.b2bBack;
