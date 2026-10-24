import {
  CollectionFloorMissingError,
  CollectionNotYetOpenError,
} from "../domain/errors/collection-errors.js";
import { calendarCycleAt, calendarCycleToConstitute } from "../domain/services/calendar-cycles.js";
import { closureDayOf } from "../domain/services/collection-procedure-id.js";
import type { CollectionAssemblyReaders } from "./collection-constitution-ports.js";
import { readAssembly, type AssemblyMode } from "./collection-constitution-support.js";

/**
 * Les commandes candidates des clôtures SANS lot de la table des procédures
 * (colonne « Commandes », Hugo 2026-10-24) — par le chemin de la
 * constitution et de l'aperçu (`readAssembly`), jamais par une règle recopiée.
 *
 * Deux assemblages au plus, quel que soit le nombre de lignes :
 *
 * - la clôture à préparer, comme la constitution la prendrait (dernier cycle
 *   clos, sans simuler de facture) — lue seulement si elle est à préparer ;
 * - la prochaine clôture du calendrier, comme l'aperçu la montre (cycle qui
 *   court, factures simulées).
 *
 * Ce qui n'en a pas reste absent (« — ») : une manquée n'a pas de candidates
 * propres — ses commandes entrent dans le lot de la dernière clôture
 * (`missedRow`) —, et une clôture à venir plus lointaine que la prochaine
 * n'est assemblée par rien.
 */
export async function readCandidateOrderCounts(
  readers: CollectionAssemblyReaders,
  legalEntityId: string,
  now: Date,
  toPrepare: boolean,
): Promise<ReadonlyMap<string, number>> {
  const counted = await Promise.all([
    toPrepare ? countAt(readers, legalEntityId, now, TO_PREPARE) : null,
    countAt(readers, legalEntityId, now, RUNNING),
  ]);
  return new Map(counted.filter((entry) => entry !== null));
}

/** Ce que la constitution prendrait — sans verrou : une lecture ne verrouille rien. */
const TO_PREPARE: AssemblyMode = {
  cycleOf: calendarCycleToConstitute,
  simulateUninvoiced: false,
  lockRows: false,
};

/** Ce que l'aperçu montre (`GetCollectionPreviewHandler`). */
const RUNNING: AssemblyMode = {
  cycleOf: calendarCycleAt,
  simulateUninvoiced: true,
  lockRows: false,
};

async function countAt(
  readers: CollectionAssemblyReaders,
  legalEntityId: string,
  now: Date,
  mode: AssemblyMode,
): Promise<readonly [string, number] | null> {
  try {
    const read = await readAssembly(readers, null, legalEntityId, now, mode);
    const orders = [...read.assembly.debits.values()]
      .flat()
      .reduce((sum, debit) => sum + debit.orders.length, 0);
    return [closureDayOf(read.cycle.closesAt), orders];
  } catch (caught) {
    // Pas de plancher, ou cycle d'avant la mise en service : rien n'est
    // prélevable, la colonne dit « — ». Le détail de la procédure, lui,
    // nomme le refus.
    if (
      caught instanceof CollectionNotYetOpenError ||
      caught instanceof CollectionFloorMissingError
    ) {
      return null;
    }
    throw caught;
  }
}
