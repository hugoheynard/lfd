import { procedureIdOf } from "./collection-procedure-id.js";
import type { ClosureToCome, ProcedureRow } from "./collection-procedure-list.js";

/**
 * Une clôture manquée : son lot ne se prépare pas pour elle — « Préparer »
 * ne prépare que la dernière clôture, et ce lot-là reprend les commandes
 * de la période manquée (`missedClosuresMessage`). Le seul avertissement
 * est la clôture manquée : sa limite, passée, n'est plus un geste.
 */
export function missedRow(
  legalEntityId: string,
  closure: ClosureToCome,
): Omit<ProcedureRow, "orderCount"> {
  return {
    id: procedureIdOf(legalEntityId, closure.closesAt),
    closesAt: closure.closesAt,
    periodLabel: closure.periodLabel,
    modes: closure.modes,
    phase: "missed",
    stage: "file",
    batches: [],
    followed: null,
    collectionDay: closure.collectionDay,
    depositDeadline: closure.depositDeadline,
    warnings: [{ code: "missed_closure", count: null }],
  };
}
