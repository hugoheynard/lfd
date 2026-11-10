import type { ResupplyTrace } from "../domain/resupply-trace.js";
import { UnreadableResupplyRowError } from "../domain/resupply-unreadable-row-error.js";

/** Les quatre colonnes d'un geste daté et signé, nullables en base. */
export interface TraceColumns {
  readonly at: Date | null;
  readonly staffUserId: string | null;
  readonly name: string | null;
  readonly role: string | null;
}

/** Où se trouve la ligne relue — pour nommer le défaut, pas pour le réparer. */
export interface TraceOrigin {
  readonly table: string;
  readonly rowId: string;
  readonly gesture: string;
}

/**
 * Un geste relu : `null` sans instant, entier avec. Un instant sans auteur
 * complet est refusé ({@link UnreadableResupplyRowError}) au lieu d'être
 * comblé de chaînes vides.
 */
export function wholeTraceOf(columns: TraceColumns, origin: TraceOrigin): ResupplyTrace | null {
  const { at, staffUserId, name, role } = columns;
  if (at === null) {
    return null;
  }
  if (staffUserId === null || name === null || role === null) {
    throw new UnreadableResupplyRowError(origin.table, origin.rowId, origin.gesture);
  }
  return { at, author: { staffUserId, name, role } };
}
