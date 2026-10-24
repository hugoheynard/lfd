import {
  instantToLocal,
  type CollectionProcedureAccountsView,
  type CollectionProcedureDebtorGapView,
  type CollectionProcedureFileView,
  type CollectionProcedureMandatesView,
} from "@lfd/contracts";

import { isDeadBatchStatus } from "../domain/entities/collection-batch-status.js";
import type { StoredBatchView } from "../domain/ports/collection-batch.reader.js";
import type { LotDebtorsReader } from "../domain/ports/lot-debtors.reader.js";
import { fileStatus, type ProcedureBatch } from "../domain/services/collection-procedure.js";
import { preparedDepositMargin } from "../domain/services/collection-procedure-warnings.js";
import {
  lotDebtorGaps,
  type BankReferentialStanding,
} from "../domain/services/lot-debtor-bank-standing.js";

/**
 * Les débiteurs du lot suivi et des autres lots VIVANTS de la procédure à
 * qui il manque le compte ou le mandat chez CENET (P4 révisé, 2026-10-24).
 * Un lot annulé ou rejeté ne part pas : ses débiteurs n'ont rien à dire.
 */
export async function readDebtorsNotImported(
  reader: LotDebtorsReader,
  legalEntityId: string,
  lots: readonly ProcedureBatch[],
  standing: BankReferentialStanding,
): Promise<readonly CollectionProcedureDebtorGapView[]> {
  const ids = [
    ...new Set(lots.filter((lot) => !isDeadBatchStatus(lot.status)).map((lot) => lot.id)),
  ];
  const lines = await reader.ofBatches(legalEntityId, ids);
  return lotDebtorGaps(lines, standing);
}

/** L'onglet 3 et ses avertissements — ceux des débiteurs sont lus par `readDebtorsNotImported`. */
export function fileStep(
  input: {
    readonly followed: ProcedureBatch | null;
    readonly toPrepare: boolean;
    readonly accounts: CollectionProcedureAccountsView;
    readonly mandates: CollectionProcedureMandatesView;
    readonly debtorsNotImported: readonly CollectionProcedureDebtorGapView[];
  },
  views: ReadonlyMap<string, StoredBatchView>,
): CollectionProcedureFileView {
  const { followed, accounts, mandates } = input;
  const stored = followed === null ? undefined : views.get(followed.id);
  return {
    ...fileStatus(followed, input.toPrepare),
    mandatesNotImportedCount: mandates.toExportCount,
    excludedMandateCount: mandates.excludedCount,
    excludedAccountCount: accounts.excludedCount,
    debtorsNotImported: input.debtorsNotImported,
    tightDepositMargin:
      stored === undefined
        ? null
        : preparedDepositMargin(
            stored.status,
            instantToLocal(new Date(stored.constitutedAt)).day,
            stored.depositDeadline,
          ),
  };
}
