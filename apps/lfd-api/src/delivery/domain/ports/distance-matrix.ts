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
 * **D'où vient un coût** (L8-C3) : `road` quand la carte routière (OSRM) a
 * répondu, `crow_flies` sinon — sans URL configurée, ou quand elle n'a pas
 * répondu à temps. L'écran le dit : jamais une proposition routière annoncée
 * qui n'en est pas une.
 */
export type CostEstimate = "road" | "crow_flies";

/** Une fonction de coût, et ce qu'elle vaut. Les services du domaine n'en lisent que {@link CostFn}. */
export interface EstimatedCost extends CostFn {
  readonly estimate: CostEstimate;
}

/**
 * **Port des distances** (L7-C2) — l'algorithme ne connaît pas les routes, il
 * ne connaît que des coûts. Au premier passage, le vol d'oiseau × détour ÷
 * vitesse ; la distance routière (OSRM, lot 8) se branche ici SANS toucher à
 * la répartition ni à l'ordre.
 *
 * Asynchrone parce qu'une matrice routière l'est (OSRM `/table`) ; la
 * fonction rendue, elle, est synchrone.
 */
export abstract class DistanceMatrix {
  abstract build(
    points: ReadonlyMap<string, GeoPoint>,
    settings: RoutingSettings,
  ): Promise<EstimatedCost>;
}
