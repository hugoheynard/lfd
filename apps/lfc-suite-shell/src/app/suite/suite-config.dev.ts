import { DEV_URLS, GATEWAY_URLS, isViaGateway } from "@lfd/endpoints";

/**
 * URLs des apps hostées — version **DEV**. Substituée à `suite-config.ts` par la
 * configuration `development` d'angular.json.
 *
 * **Gateway-aware** : si le shell est servi via la passerelle (`suite.localhost:8787`),
 * il iframe les apps par leurs sous-domaines de passerelle (`pim.localhost:8787`,
 * …) → tout passe par le gateway, cross-origin par sous-domaine, fidèle à la
 * prod B. En direct (`localhost:7300`), il iframe les `localhost:PORT`. Les ports
 * comme les sous-domaines viennent du registre unique `@lfd/endpoints`.
 */
const viaGateway = typeof window !== "undefined" && isViaGateway(window.location.hostname);
const urls = viaGateway ? GATEWAY_URLS : DEV_URLS;

export const SUITE_APP_URLS: Readonly<Record<string, string>> = {
  "b2b-admin": urls.b2bAdminFront,
};
