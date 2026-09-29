/**
 * L'aiguillage du Worker d'entrée, isolé de `worker.ts` pour être éprouvé sans
 * le monde Containers : les tuiles d'un côté, le calcul routier de l'autre.
 *
 * 🔴 Servir une tuile ne réveille JAMAIS le conteneur OSRM (L10t-C3) : le
 * conteneur n'est demandé — `container()` n'est appelé — que pour une requête
 * que `/tiles` n'a pas prise. Une carte fait des dizaines de requêtes
 * partielles ; chacune réveillant OSRM coûterait un conteneur allumé toute la
 * matinée pour rien.
 */
import { admit, isContainerFailure, unavailable } from "./osrm-request";
import { isTilesPath, serveTiles } from "./tiles";
import type { TileBucket } from "./tiles";

/** Ce dont l'aiguillage a besoin : le bucket, et de quoi joindre le conteneur À LA DEMANDE. */
export interface DispatchDeps {
  readonly tiles: TileBucket;
  readonly container: () => { fetch(request: Request): Promise<Response> };
}

export async function dispatch(request: Request, deps: DispatchDeps): Promise<Response> {
  if (isTilesPath(new URL(request.url).pathname)) {
    return serveTiles(request, deps.tiles);
  }
  const admission = admit(request);
  if (!admission.admitted) {
    return admission.response;
  }
  try {
    const response = await deps.container().fetch(request);
    if (isContainerFailure(response.status)) {
      return unavailable(`le conteneur a rendu ${response.status}`);
    }
    return response;
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : "coupure inattendue");
  }
}
