import { B2B_API_BASE_VALUE } from './api.env.generated';

/**
 * Base de l'API B2B — version **PRODUCTION**.
 *
 * Remplacé en dev par `api-config.dev.ts` (fileReplacements, cf. angular.json) →
 * localhost/gateway. En prod, l'app admin tape le **même backend B2B** que la boutique
 * (Invariant C), mais sur sa surface `/admin/*`.
 *
 * **Injectée au build** : la valeur vient de l'environnement via
 * `scripts/generate-api-config.mjs` → `api.env.generated.ts` (git-ignored). Source : la
 * variable `B2B_ADMIN_API_BASE_URL` (CI/Cloudflare) en déployé, l'origine stable
 * `api-b2b.<zone>` derrière la passerelle. Jamais un secret — juste une origine.
 */
export const B2B_API_BASE = B2B_API_BASE_VALUE;
