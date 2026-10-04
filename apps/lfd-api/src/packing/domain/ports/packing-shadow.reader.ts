import type { PackableOrder } from "../services/packable.js";

/** La réserve d'un article pour une journée. */
export interface ShadowStock {
  readonly sku: string;
  readonly received: number;
  readonly returned: number;
  readonly packed: number;
}

/** Ce que l'ombre tient d'une journée. */
export interface ShadowDay {
  readonly orders: readonly PackableOrder[];
  readonly stocks: readonly ShadowStock[];
}

/**
 * **L'ombre du colisage, en lecture** — port séparé de l'écriture (ISP) : la
 * comparaison lit, les abonnés écrivent.
 */
export abstract class PackingShadowReader {
  abstract dayOf(serviceDay: string): Promise<ShadowDay>;
}
