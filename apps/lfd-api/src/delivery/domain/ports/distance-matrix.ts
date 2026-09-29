import type { GeoPoint } from "../value-objects/geo-point.js";
import type { RoutingSettings } from "../value-objects/routing-settings.js";

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
 * ne connaît que des coûts. Au premier passage, le vol d'oiseau × détour ÷
 * vitesse ; une distance routière (OSRM, un service managé) se branchera ici
 * SANS toucher à la répartition ni à l'ordre.
 *
 * Asynchrone parce qu'une matrice routière l'est (OSRM `/table`) ; la
 * fonction rendue, elle, est synchrone.
 */
export abstract class DistanceMatrix {
  abstract build(points: ReadonlyMap<string, GeoPoint>, settings: RoutingSettings): Promise<CostFn>;
}
