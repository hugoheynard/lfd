import type { GeoPoint } from "../value-objects/geo-point.js";

/**
 * **Ce que coûte un trajet** entre deux points connus, par leur identifiant
 * (architecture des tournées, §7). Définie UNIQUEMENT sur les identifiants
 * passés à sa construction : un identifiant inconnu lève, pour qu'on ne mêle
 * jamais deux matrices.
 */
export interface CostFn {
  meters(fromId: string, toId: string): number;
  seconds(fromId: string, toId: string): number;
}

/**
 * **Port des distances** (L7-C2) — l'algorithme ne connaît pas les routes, il
 * ne connaît que des coûts.
 *
 * Depuis le lot 10 bis (L10b-C5), les coûts sont **par la route, ou rien** :
 * le vol d'oiseau se trompait de trente minutes en montagne, dans les deux
 * sens, et aucun facteur de détour ne corrigeait les deux (L8-C6). Une
 * implémentation qui ne peut pas rendre la route LÈVE — elle ne rend jamais
 * une estimation d'une autre nature.
 *
 * Asynchrone parce qu'une matrice routière l'est (OSRM `/table`) ; la
 * fonction rendue, elle, est synchrone.
 */
export abstract class DistanceMatrix {
  /** @throws {RoadRoutingUnavailableError} le calcul routier ne répond pas, ou n'est pas branché. */
  abstract build(points: ReadonlyMap<string, GeoPoint>): Promise<CostFn>;
}
