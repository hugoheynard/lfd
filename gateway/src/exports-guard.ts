/**
 * La limite de débit de l'export des ventes — `/api/lfd/exports/…` (plan
 * `documentation/commandes/export/plan-export-des-ventes.md`, § 6.2).
 *
 * **Par IP, avant de transmettre** : un bombardement coûte des invocations de
 * passerelle bornées, et les essais de clé le sont du même coup. La
 * passerelle ne VALIDE pas la clé (`X-Export-Key`) — c'est l'API qui la relit
 * en base — et ne limite pas par clé : un attaquant en changerait à chaque
 * appel, et le secret deviendrait une clé de compteur en clair. L'en-tête
 * passe donc tel quel, intact, comme tous les autres.
 *
 * Le chemin se compare sans casse : le routeur de l'API ne distingue pas
 * `/Exports/sales` de `/exports/sales`, la limite non plus.
 *
 * Aucun import du monde Workers : des fonctions sur `Request`/`Response`,
 * exécutables sous Node pour les tests.
 */
import type { RoutePlannerRateLimiter } from "./route-planner-guard";
import type { Target } from "./routes";

/** Ce que la garde lit dans l'environnement du Worker. */
export interface ExportsGuardEnv {
  /** Absent en `wrangler dev` : on ne limite alors rien, la clé garde seule. */
  readonly EXPORTS_RATE_LIMITER?: RoutePlannerRateLimiter;
}

/** Le chemin des exports, préfixe `/api/lfd` retiré. */
const EXPORTS_PATH = "/exports";

/** La requête vise-t-elle l'export (`/exports` ou `/exports/…`, sans casse) ? */
export function isExportsPath(path: string): boolean {
  const lowered = path.toLowerCase();
  return lowered === EXPORTS_PATH || lowered.startsWith(`${EXPORTS_PATH}/`);
}

/**
 * Rend la requête intacte, ou un 429 si l'IP a dépassé sa limite. Toute autre
 * destination que l'export de `lfd-api` passe sans compteur.
 */
export async function guardExports(
  target: Target,
  request: Request,
  env: ExportsGuardEnv,
): Promise<Request | Response> {
  if (target.kind !== "backend" || target.backend !== "lfd" || !isExportsPath(target.path)) {
    return request;
  }
  const limiter = env.EXPORTS_RATE_LIMITER;
  if (limiter === undefined) {
    return request;
  }
  const ip = request.headers.get("cf-connecting-ip");
  // Sans IP — ce qui n'arrive pas depuis Internet —, une clé commune : on
  // limite quand même, plutôt que d'ouvrir une voie sans compteur.
  const key = ip !== null && ip !== "" ? `exports:${ip}` : "exports:sans-ip";
  const { success } = await limiter.limit({ key });
  return success ? request : tooManyRequests();
}

function tooManyRequests(): Response {
  return new Response("Gateway LFC : trop de requêtes.", {
    status: 429,
    headers: { "retry-after": "60", "content-type": "text/plain; charset=utf-8" },
  });
}
