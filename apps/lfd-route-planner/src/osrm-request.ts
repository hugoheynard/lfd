/**
 * Ce que `lfd-route-planner` accepte de transmettre au conteneur, et ce qu'il répond
 * quand le conteneur ne répond pas. Fonctions pures, sous tests : le Worker
 * d'entrée (`worker.ts`) ne fait que les exécuter.
 */

/**
 * Les deux services OSRM utilisés (plan de tournée, lot 8, L8-C2) : `/table`
 * pour la matrice de durées du calculateur, `/route` pour tracer une tournée
 * (plus tard) et pour la vérification du graphe. Tout le reste d'OSRM
 * (`/match`, `/trip`, `/tile`, `/nearest`) n'a aucun appelant : l'ouvrir
 * élargirait la surface sans rien servir.
 */
const SERVED_PREFIXES = ["/table/", "/route/"] as const;

/** Verdict sur une requête entrante : on la transmet, ou on la refuse. */
export type Admission =
  { readonly admitted: true } | { readonly admitted: false; readonly response: Response };

/** N'admet que `GET /table/…` et `GET /route/…`. */
export function admit(request: Request): Admission {
  if (request.method !== "GET") {
    return {
      admitted: false,
      response: refusal(405, "Seul GET est servi : OSRM ne fait que lire."),
    };
  }
  const { pathname } = new URL(request.url);
  if (!SERVED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return {
      admitted: false,
      response: refusal(404, `Chemin non servi : ${pathname}. Seuls /table/… et /route/… le sont.`),
    };
  }
  return { admitted: true };
}

/**
 * Réponse quand le conteneur n'a pas pu répondre (démarrage refusé, instance
 * indisponible, coupure). Un 503 NET, jamais un corps d'OSRM déguisé : le
 * client (`lfd-api`) le rejoue une fois (réveil), puis refuse « Proposer » en
 * le disant (L10b-C5 — le vol d'oiseau a disparu).
 */
export function unavailable(cause: string): Response {
  return refusal(
    503,
    `Le calcul routier ne répond pas (${cause}). Retomber sur l'estimation à vol d'oiseau.`,
  );
}

/**
 * Une réponse du conteneur signale-t-elle que le CONTENEUR est en panne ?
 * OSRM rend 200 ou 400 (requête invalide, table trop grande) : ceux-là se
 * transmettent tels quels. Les 5xx, 429 et 520 viennent de la couche conteneur
 * de Cloudflare (instance absente, démarrage échoué, origine refusée).
 */
export function isContainerFailure(status: number): boolean {
  return status >= 500 || status === 429;
}

function refusal(status: number, message: string): Response {
  return Response.json({ code: "LfdOsrmRefused", message }, { status });
}
