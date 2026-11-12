import type { PayerMeansEntry } from "../domain/services/collection-means-timeline.js";
import { collectionMeansOf } from "../domain/value-objects/collection-means.js";

/** Une ligne de `payer_collection_means`, telle que l'adaptateur la lit. */
export interface PayerMeansRow {
  readonly id: string;
  readonly effectiveFrom: Date;
  readonly means: string;
  readonly reason: string;
  readonly createdAt: Date;
  readonly createdByStaffId: string;
  readonly cancelledAt: Date | null;
  readonly cancelledByStaffId: string | null;
}

/** Ligne → segment ; un moyen inconnu en base est refusé, jamais pris pour le prélèvement. */
export function payerMeansEntryOf(row: PayerMeansRow): PayerMeansEntry {
  return {
    id: row.id,
    effectiveFrom: row.effectiveFrom,
    means: collectionMeansOf(row.means),
    reason: row.reason,
    createdAt: row.createdAt,
    createdByStaffId: row.createdByStaffId,
    cancelledAt: row.cancelledAt,
    cancelledByStaffId: row.cancelledByStaffId,
  };
}
