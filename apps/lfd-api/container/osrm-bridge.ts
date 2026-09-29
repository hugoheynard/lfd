// Le pont entre le conteneur de l'API et le calcul routier `lfd-osrm` (plan de
// tournée, lot 8, forme B-ter — documentation/livraisons/plan-preparation-de-tournee.md,
// L8-C10/C11).
//
// Le NestJS appelle `http://osrm.internal/table/…` (`OSRM_URL`). Ce nom
// n'existe dans aucun DNS : le Worker de `lfd-api` l'intercepte à la sortie du
// conteneur (`Backend.outboundByHost`, `worker.ts`) et passe la requête à
// `lfd-osrm` par son service binding. Aucune adresse publique, aucun passage
// par Internet.
//
// Hors de `worker.ts` pour la même raison qu'`edge-guard.ts` : ce qui décide
// doit pouvoir se tester sans le monde Workers.

/** L'hôte intercepté — exact, en HTTP. `OSRM_URL` doit le viser tel quel. */
export const OSRM_INTERNAL_HOST = "osrm.internal";

/** Ce que le service binding offre : un `fetch`, rien d'autre. */
export interface OsrmService {
  fetch(request: Request): Promise<Response>;
}

/**
 * Passe la requête à `lfd-osrm` et rend sa réponse telle quelle. Un binding
 * absent (API déployée avant `lfd-osrm`) ou une coupure donnent un **503
 * net** : le NestJS retombe alors sur le vol d'oiseau et le dit (L8-C3). On
 * ne rend jamais un corps qui ressemblerait à une réponse d'OSRM.
 */
export async function bridgeToOsrm(
  request: Request,
  osrm: OsrmService | undefined,
): Promise<Response> {
  if (osrm === undefined) {
    return unavailable("le binding OSRM n'est pas posé sur ce Worker");
  }
  try {
    return await osrm.fetch(request);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : "coupure inattendue");
  }
}

function unavailable(cause: string): Response {
  return Response.json(
    {
      code: "LfdOsrmBridgeUnavailable",
      message: `Le calcul routier ne répond pas (${cause}). Retomber sur l'estimation à vol d'oiseau.`,
    },
    { status: 503 },
  );
}
