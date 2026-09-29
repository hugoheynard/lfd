import type { PlanBinType } from "../services/loading-plan.js";
import type { CargoDimensions } from "../value-objects/cargo-space.js";

/** La charge du véhicule d'une tournée, telle qu'elle est AUJOURD'HUI. */
export interface RoundVehicleLoadRow {
  readonly cargo: CargoDimensions | null;
  /** Le volume de la caisse réfrigérée, ou `null` : véhicule sec. */
  readonly refrigeratedLiters: number | null;
}

/**
 * Port de **lecture** du plan de chargement (lot 4 bis, tranche D) — ce que
 * les vues du chargement ne lisent pas : la forme des bacs et la charge du
 * véhicule. Distinct de `DeliveryLoadingReader` (ISP) : aucune autre lecture
 * n'en a besoin.
 */
export abstract class LoadingPlanReader {
  /** La charge du véhicule de cette tournée, ou `null` si la tournée n'existe pas. */
  abstract vehicleLoadOf(roundId: string): Promise<RoundVehicleLoadRow | null>;

  /** Ces types de bacs, archivés compris (v2-7), par identifiant. */
  abstract binTypes(ids: readonly string[]): Promise<ReadonlyMap<string, PlanBinType>>;
}
