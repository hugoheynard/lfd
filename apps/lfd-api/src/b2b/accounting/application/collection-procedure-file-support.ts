import {
  instantToLocal,
  type CollectionProcedureDebtorGapView,
  type CollectionProcedureFileView,
} from "@lfd/contracts";

import { isDeadBatchStatus } from "../domain/entities/collection-batch-status.js";
import type { StoredBatchView } from "../domain/ports/collection-batch.reader.js";
import type { LotDebtorsReader } from "../domain/ports/lot-debtors.reader.js";
import { fileStatus, type ProcedureBatch } from "../domain/services/collection-procedure.js";
import { preparedDepositMargin } from "../domain/services/collection-procedure-warnings.js";
import {
  bankLimitWarningsOf,
  type LimitsToCompare,
} from "../domain/services/bank-limit-warnings.js";
import type { SepaScheme } from "../domain/value-objects/sepa-scheme.js";
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

/**
 * L'onglet 3 et ses avertissements — ceux des débiteurs sont lus par
 * `readDebtorsNotImported` ; ceux des plafonds (PL2) comparent le lot suivi
 * aux lots de l'entité, `views` étant la liste murée par l'entité.
 */
export function fileStep(
  input: {
    readonly followed: ProcedureBatch | null;
    readonly toPrepare: boolean;
    readonly debtorsNotImported: readonly CollectionProcedureDebtorGapView[];
    /** Les plafonds de l'entité, par schéma (PL1). */
    readonly limits: Readonly<Record<SepaScheme, LimitsToCompare>>;
  },
  views: ReadonlyMap<string, StoredBatchView>,
): CollectionProcedureFileView {
  const { followed } = input;
  const stored = followed === null ? undefined : views.get(followed.id);
  return {
    ...fileStatus(followed, input.toPrepare),
    debtorsNotImported: input.debtorsNotImported,
    tightDepositMargin:
      stored === undefined
        ? null
        : preparedDepositMargin(
            stored.status,
            instantToLocal(new Date(stored.constitutedAt)).day,
            stored.depositDeadline,
          ),
    bankLimits:
      stored === undefined
        ? null
        : bankLimitWarningsOf(input.limits[stored.scheme], stored, [...views.values()]),
  };
}
