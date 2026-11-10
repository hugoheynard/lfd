import type { CollectionReturn as CollectionReturnRow } from "../../../platform/database/client/client.js";
import type { CollectionReturnState } from "../domain/entities/collection-return.js";

/** `DATE` → `AAAA-MM-JJ` : la colonne est lue à minuit UTC. */
export function returnDayOf(column: Date): string {
  return column.toISOString().slice(0, 10);
}

/** `AAAA-MM-JJ` → `DATE`. */
export function returnDayColumn(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** Ligne → état du domaine. Les énumérations Prisma ont les mêmes valeurs. */
export function toCollectionReturnState(row: CollectionReturnRow): CollectionReturnState {
  return {
    id: row.id,
    endToEndId: row.endToEndId,
    kind: row.kind,
    reasonCode: row.reasonCode,
    reasonLabel: row.reasonLabel,
    returnedOn: returnDayOf(row.returnedOn),
    amountCents: row.amountCents,
    feeCents: row.feeCents,
    source: row.source,
    recorded: { at: row.recordedAt, staffId: row.recordedByStaffId },
    resolution: row.resolution,
    resolutionNote: row.resolutionNote,
    resolved:
      row.resolvedAt === null || row.resolvedByStaffId === null
        ? null
        : { at: row.resolvedAt, staffId: row.resolvedByStaffId },
  };
}

/** État du domaine → colonnes (hors `id`). */
export function collectionReturnColumns(state: CollectionReturnState) {
  return {
    endToEndId: state.endToEndId,
    kind: state.kind,
    reasonCode: state.reasonCode,
    reasonLabel: state.reasonLabel,
    returnedOn: returnDayColumn(state.returnedOn),
    amountCents: state.amountCents,
    feeCents: state.feeCents,
    source: state.source,
    recordedAt: state.recorded.at,
    recordedByStaffId: state.recorded.staffId,
    resolution: state.resolution,
    resolutionNote: state.resolutionNote,
    resolvedAt: state.resolved?.at ?? null,
    resolvedByStaffId: state.resolved?.staffId ?? null,
  };
}
