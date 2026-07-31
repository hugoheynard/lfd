/**
 * Base de l'API B2B — version **PRODUCTION**.
 *
 * Remplacé en dev par `api-config.dev.ts` (fileReplacements, cf. angular.json) →
 * localhost. En prod, l'app admin tape le **même backend B2B** que la boutique
 * (Invariant C), mais sur sa surface `/admin/*`.
 *
 * ⚠️ Ajuster à l'URL réelle au déploiement (origine stable `api-b2b.…` ou chemin
 * `/api/b2b` derrière la passerelle — cf. documentation/architecture-suite-gateway-scaling.md).
 */
export const B2B_API_BASE = 'https://api-b2b.lafoliecoffee.xyz';
