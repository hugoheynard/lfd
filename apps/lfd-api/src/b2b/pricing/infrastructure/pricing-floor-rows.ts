import { PricingFloor, type FloorClientele } from "../domain/entities/pricing-floor.js";
import { floorFromRow, type FloorRow } from "./price-rows.js";

/** Une ligne de `price_floors` avec ce que l'agrégat porte en plus de la résolution. */
export interface PricingFloorRow extends FloorRow {
  readonly clientele: FloorClientele;
}

/**
 * **La ligne → l'agrégat plancher.** Partagé par la pose et le report, qui
 * relisent tous deux une version pour la borner ou la recopier.
 */
export function pricingFloorFromRow(row: PricingFloorRow): PricingFloor {
  const scoped = floorFromRow(row);
  return PricingFloor.reconstitute({
    id: scoped.id,
    scope: scoped.scope,
    clientele: row.clientele,
    policy: scoped.policy,
    createdBy: row.createdBy,
    referenceCanonicalMillicents: row.referenceCanonicalMillicents,
    validFrom: row.validFrom,
    validTo: row.validTo,
  });
}
