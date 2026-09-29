import type { DepartedStop } from "../entities/departure-sheet.js";

/**
 * Port d'**écriture** de l'exécution au départ (lot 4, « snapshot au départ »)
 * — une ligne par arrêt, écrite par l'exécution seule (C10), dans la
 * transaction de « Partir ».
 */
export abstract class DepartedStopRepository {
  abstract record(stops: readonly DepartedStop[]): Promise<void>;
}
