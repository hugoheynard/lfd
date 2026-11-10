import type { CollectionReturnView } from "@lfd/contracts";

import type { ReturnableLine } from "../domain/entities/collection-return.js";
import { representationRefusal } from "../domain/entities/collection-return.js";
import { representationRefusalText } from "../domain/errors/collection-return-errors.js";
import type { CollectionReturnRow } from "../domain/ports/collection-returns.reader.js";
import type { MandateRecheckReader } from "../domain/ports/mandate-recheck.reader.js";
import type { ReturnableLinesReader } from "../domain/ports/returnable-lines.reader.js";
import { cycleTagOf } from "../domain/services/pain008-document.js";
import {
  reasonDescription,
  reasonProposesRevocation,
} from "../domain/value-objects/bank-return-reason.js";

export interface ReturnViewReaders {
  readonly lines: ReturnableLinesReader;
  readonly mandates: MandateRecheckReader;
}

/**
 * Les retours en vues, avec — pour ceux à traiter — ce que l'écran peut
 * proposer : re-présenter (ou pourquoi pas, avec les mots du refus que
 * l'agrégat opposerait) et révoquer le mandat quand le motif l'appelle.
 */
export async function returnViews(
  readers: ReturnViewReaders,
  rows: readonly CollectionReturnRow[],
): Promise<readonly CollectionReturnView[]> {
  const pending = rows.filter((row) => row.resolution === "pending");
  const lines = await readers.lines.byEndToEndIds(pending.map((row) => row.endToEndId));
  const mandates = await readers.mandates.currentOf([
    ...new Set(pending.map((row) => row.mandateId)),
  ]);
  return rows.map((row) => {
    const line = lines.get(row.endToEndId);
    const active = mandates.get(row.mandateId)?.active === true;
    return toView(row, row.resolution === "pending" ? (line ?? null) : null, active);
  });
}

function toView(
  row: CollectionReturnRow,
  pendingLine: ReturnableLine | null,
  mandateActive: boolean,
): CollectionReturnView {
  const refusal = pendingLine === null ? null : representationRefusal(pendingLine, mandateActive);
  return {
    id: row.id,
    endToEndId: row.endToEndId,
    batchId: row.batchId,
    batchLabel: `Lot ${row.scheme} ${cycleTagOf(row.cycleClosesAt)}`,
    lineRank: row.lineRank,
    debtorCompanyId: row.debtorCompanyId,
    debtorName: row.debtorName,
    mandateId: row.mandateId,
    mandateReference: row.mandateReference,
    kind: row.kind,
    reasonCode: row.reasonCode,
    reason: reasonDescription(row.reasonCode, row.reasonLabel),
    returnedOn: row.returnedOn,
    amountCents: row.amountCents,
    feeCents: row.feeCents,
    source: row.source,
    recordedAt: row.recordedAt.toISOString(),
    resolution: row.resolution,
    resolutionNote: row.resolutionNote,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    gestures:
      pendingLine === null
        ? null
        : {
            representRefusal: refusal === null ? null : representationRefusalText(refusal),
            proposesRevocation: reasonProposesRevocation(row.reasonCode),
          },
  };
}
