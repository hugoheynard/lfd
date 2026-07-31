/**
 * URLs des apps hostées — version **PRODUCTION**.
 *
 * Remplacé en dev par `suite-config.dev.ts` (fileReplacements, cf. angular.json)
 * → localhost. Un id absent de la map = **tuile stub** (app pas déployée).
 *
 * Ces URLs définissent AUSSI l'**allowlist d'origines** du bridge postMessage
 * (voir `suite-bridge.ts`) : le shell ne parle qu'aux origines listées ici.
 *
 * ⚠️ Ajuster aux URLs Pages réelles au moment du déploiement.
 */
export const SUITE_APP_URLS: Readonly<Record<string, string>> = {
  pim: 'https://lfc-pim.pages.dev',
  // 'b2b-admin': 'https://lfc-b2b-admin.pages.dev',  // quand l'app existera
};
