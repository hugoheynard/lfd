/** Une ligne du reste abandonné, nommée par la commande. */
export interface AbandonedLine {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
}

/**
 * Ce que le commerce sait d'un départ incomplet décidé : le reste abandonné,
 * et l'état d'impression de ses BL vivants — `to_print` si l'un n'est pas
 * imprimé à sa version courante, `printed` s'ils le sont tous, `null` sans BL
 * vivant.
 */
export interface ShortfallAftermath {
  readonly abandoned: readonly AbandonedLine[];
  readonly deliveryNote: "to_print" | "printed" | null;
}

/**
 * **Après la décision d'un départ incomplet** (Hugo, 2026-10-25), vu du poste
 * de colisage — DÉCLARÉ par le colisage, IMPLÉMENTÉ par le commerce.
 *
 * Le colisage ne peut pas le dire seul : sa fiche autorisée a perdu les
 * lignes décidées à zéro (`authorizedLinesOf`) et ne garde que les quantités
 * parties ; le dû d'origine et le BL sont au commerce.
 */
export abstract class ShortfallAftermathReader {
  /** Parmi ces commandes, celles au départ incomplet décidé, par id. */
  abstract among(orderIds: readonly string[]): Promise<ReadonlyMap<string, ShortfallAftermath>>;
}
