import type { BinCapacity } from "../entities/bin-capacity.js";

/**
 * Port d'**écriture** de la grille des contenances — une case à la fois.
 *
 * `remove` efface la ligne : une case vide EST l'absence de contenance, et ce
 * n'est pas un agrégat métier qu'on archiverait (`CLAUDE.md` §3.1). Le journal
 * garde l'avant (`delivery_bin_capacity.set`).
 */
export abstract class BinCapacityRepository {
  /** Les unités de cette case, ou `null` si elle est vide. */
  abstract unitsOf(binTypeId: string, sku: string): Promise<number | null>;

  abstract save(capacity: BinCapacity, at: Date): Promise<void>;

  abstract remove(binTypeId: string, sku: string): Promise<void>;
}
