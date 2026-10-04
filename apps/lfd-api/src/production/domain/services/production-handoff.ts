import type {
  PackedMark,
  ProductionBatchSnapshot,
  ProductionOrderSnapshot,
} from "../entities/production-day.snapshot.js";

/**
 * **Une remise au colisage**, ou un retour (plan
 * `documentation/colisage/plan-domaine-colisage.md`, §10.3, §11.2, §13).
 *
 * La remise EST la sortie du four : une fournée déclarée en fait une, sous
 * l'`id` de la fournée. Un retour est une ligne de plus, de quantité négative,
 * jamais une correction de la remise.
 */
export interface ProductionHandoff {
  readonly id: string;
  readonly sku: string;
  /** Signée : positive = remise, négative = retour accepté. Jamais nulle. */
  readonly quantity: number;
  readonly source: HandoffSource;
  readonly at: Date;
  readonly by: string;
  /** La demande de retour ; `null` pour une remise. */
  readonly requestId: string | null;
}

/** D'où vient la remise. La vague viendra par une valeur de plus (§11.1, Q4). */
export type HandoffSource = "batch";

/** La demande de retour d'une fournée : déterministe, une fournée ne s'annule qu'une fois. */
export function returnRequestIdOf(batchId: string): string {
  return `return-${batchId}`;
}

/**
 * La remise d'une fournée déclarée — son `id`, sa quantité, son geste.
 *
 * ⚠️ Jamais pour une fournée implicite (coche héritée) : elles n'existent que
 * sur des journées d'avant les fournées (§13, B3). C'est l'appelant qui ne
 * passe que la fournée qu'il vient de DÉCLARER, pas celles qu'il matérialise.
 */
export function handoffOf(batch: ProductionBatchSnapshot): ProductionHandoff {
  return {
    id: batch.id,
    sku: batch.sku,
    quantity: batch.quantity,
    source: "batch",
    at: batch.recorded.at,
    by: batch.recorded.by,
    requestId: null,
  };
}

/** Le retour d'une fournée remise puis annulée — toute sa quantité, signée négative. */
export function returnOf(batch: ProductionBatchSnapshot, mark: PackedMark): ProductionHandoff {
  const requestId = returnRequestIdOf(batch.id);
  return {
    id: requestId,
    sku: batch.sku,
    quantity: -batch.quantity,
    source: "batch",
    at: mark.at,
    by: mark.by,
    requestId,
  };
}

/**
 * Les commandes qu'un retirage vient d'inscrire : celles d'`after` qu'`before`
 * ne portait pas, par `orderId` — le filtre même d'`absorbArrivals`.
 */
export function arrivalsBetween(
  before: readonly ProductionOrderSnapshot[],
  after: readonly ProductionOrderSnapshot[],
): readonly ProductionOrderSnapshot[] {
  const known = new Set(before.map((order) => order.orderId));
  return after.filter((order) => !known.has(order.orderId));
}
