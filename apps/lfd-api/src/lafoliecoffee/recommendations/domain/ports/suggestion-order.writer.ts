import type { StaffSuggestionOrder } from "@lfd/contracts";

import type { WriteStamp } from "../entities/staff-suggestion-rule.js";

/**
 * Port d'**écriture** du réglage de l'ordre (Q3) — distinct du lecteur (ISP).
 * Un réglage sans invariant à garder : un CRUD honnête, sans agrégat
 * (CLAUDE.md §3.1, « où ne pas mettre d'agrégat »). La valeur, elle, est
 * jugée par `suggestionOrder` avant d'arriver ici.
 */
export abstract class SuggestionOrderWriter {
  abstract put(order: StaffSuggestionOrder, stamp: WriteStamp): Promise<void>;
}
