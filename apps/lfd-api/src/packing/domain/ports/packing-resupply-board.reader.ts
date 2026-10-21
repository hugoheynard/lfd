import type { PackingResupplySnapshot } from "../entities/packing-resupply.js";

/** **Les fiches de réassort d'une journée, en lecture** (réassort, lot R3b). */
export abstract class PackingResupplyBoardReader {
  /** Dans l'ordre du point, puis du réassort. */
  abstract on(serviceDay: string): Promise<readonly PackingResupplySnapshot[]>;
}
