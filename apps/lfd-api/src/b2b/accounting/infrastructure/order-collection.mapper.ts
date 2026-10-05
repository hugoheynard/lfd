import type { OrderCollection as OrderCollectionRow } from "../../../platform/database/client/client.js";
import type { OrderCollectionState } from "../domain/entities/order-collection.js";

/** Ligne → état du domaine. Les énumérations Prisma ont les mêmes valeurs. */
export function toOrderCollectionState(row: OrderCollectionRow): OrderCollectionState {
  return {
    orderId: row.orderId,
    state: row.state,
    batchId: row.batchId,
    lineRank: row.lineRank,
    exclusionReason: row.exclusionReason,
    amountCents: row.amountCents,
    settledNote: row.settledNote,
    settledByStaffId: row.settledByStaffId,
    updatedAt: row.updatedAt,
  };
}

/** État du domaine → colonnes. */
export function orderCollectionColumns(state: OrderCollectionState) {
  return {
    state: state.state,
    batchId: state.batchId,
    lineRank: state.lineRank,
    exclusionReason: state.exclusionReason,
    amountCents: state.amountCents,
    settledNote: state.settledNote,
    settledByStaffId: state.settledByStaffId,
    updatedAt: state.updatedAt,
  };
}
