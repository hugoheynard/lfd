import type { ProductionDay, ServiceDay, TrancheThreshold } from "../../../day/index.js";
import { deadlinesOf } from "../../../day/index.js";
import type { AlwaysGreenLine } from "../../domain/services/always-green.js";

/** Ce que la fournée automatique lit d'une journée, une fois pour toutes ses lignes. */
export interface AlwaysGreenDayReads {
  /** Les paliers de chaque SKU ; `null` : les besoins du jour sont illisibles. */
  readonly tranches: ReadonlyMap<string, readonly TrancheThreshold[]> | null;
  readonly marginMinutes: number;
  /** SKU → sorti déclaré au dernier rouge. */
  readonly ceilings: ReadonlyMap<string, number>;
}

/**
 * **Une ligne telle que la fournée automatique la calcule**, à partir de la
 * journée et des lectures de la journée. Le même assemblage sert au tri du
 * tour (hors verrou) et au passage d'une ligne (sous le verrou) : les deux ne
 * peuvent pas lire la ligne différemment.
 */
export function alwaysGreenLineOf(
  day: ServiceDay,
  current: ProductionDay,
  sku: string,
  quantity: number,
  reads: AlwaysGreenDayReads,
): AlwaysGreenLine {
  return {
    serviceDay: day.value,
    sku,
    counted: quantity,
    deadlines:
      reads.tranches === null ? null : deadlinesOf(quantity, reads.tranches.get(sku) ?? []),
    marginMinutes: reads.marginMinutes,
    ceiling: reads.ceilings.get(sku) ?? null,
    output: current.producedOf(sku),
    batchCount: current.batches.filter((batch) => batch.sku === sku).length,
  };
}
