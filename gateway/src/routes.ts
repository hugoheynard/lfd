import { DEV_PORTS, GATEWAY_SUBDOMAINS } from "@lfd/endpoints";

const local = (port: number): string => `http://127.0.0.1:${port}`;

/**
 * Carte **hostname → upstream**. Le worker route par `Host`, fidèle au modèle B
 * (sous-domaines) : un worker possède toute la zone.
 *
 * DEV : `*.localhost:8787` → serveurs locaux (ports tenus par `@lfd/endpoints`,
 * source de vérité unique). Les navigateurs résolvent `*.localhost` → 127.0.0.1
 * sans `/etc/hosts`. On force `127.0.0.1` (et pas `localhost`) car les fronts
 * bindent en IPv4 (cf. angular.json).
 */
export const DEV_ROUTES: Readonly<Record<string, string>> = {
  [`${GATEWAY_SUBDOMAINS.suiteShell}.localhost`]: local(DEV_PORTS.suiteShell),
  [`${GATEWAY_SUBDOMAINS.pimFront}.localhost`]: local(DEV_PORTS.pimFront),
  [`${GATEWAY_SUBDOMAINS.b2bFront}.localhost`]: local(DEV_PORTS.b2bFront),
  [`${GATEWAY_SUBDOMAINS.b2bAdminFront}.localhost`]: local(DEV_PORTS.b2bAdminFront),
  [`${GATEWAY_SUBDOMAINS.pimBack}.localhost`]: local(DEV_PORTS.pimBack),
  [`${GATEWAY_SUBDOMAINS.b2bBack}.localhost`]: local(DEV_PORTS.b2bBack),
};

/**
 * PROD : `*.<zone>` → Pages (fronts) / Containers (backends). Renseigné au
 * déploiement (Phase 4). Clés disjointes des `*.localhost` → une seule table
 * de lookup suffit.
 */
export const PROD_ROUTES: Readonly<Record<string, string>> = {
  // 'suite.lafoliecoffee.xyz':     'https://lfc-suite-shell.pages.dev',
  // 'pim.lafoliecoffee.xyz':       'https://lfc-pim.pages.dev',
  // 'b2b-admin.lafoliecoffee.xyz': 'https://lfc-b2b-admin.pages.dev',
  // 'api-b2b.lafoliecoffee.xyz':   'https://api-b2b...',   // Container
  // 'api-pim.lafoliecoffee.xyz':   'https://api-pim...',   // Container
};

/** Upstream pour un hostname, ou `undefined` si non routé. */
export function routeFor(hostname: string): string | undefined {
  return DEV_ROUTES[hostname] ?? PROD_ROUTES[hostname];
}
