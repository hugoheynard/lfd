/** Une ligne du reste abandonné, nommée par la commande. */
export interface AbandonedLine {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
}

/**
 * **La décision elle-même** (Hugo, 2026-10-25 : « la décision choisie doit
 * s'afficher au colisage ») : ce que devient le reste — `abandoned` seulement,
 * « à relivrer » arrive avec E7 —, l'instant, et l'auteur tel qu'il est écrit
 * (un `StaffUser.id`), que le colisage nomme par l'annuaire du staff.
 */
export interface ShortfallDecisionMark {
  readonly remainder: "abandoned";
  readonly decidedAt: Date;
  readonly decidedBy: string;
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
  /** `null` si la commande porte l'instant de décision sans la décision elle-même. */
  readonly decision: ShortfallDecisionMark | null;
}

/**
 * Le départ décidé d'UN envoi `(commande, rang)` (plan E7 reliquat, LB) : une
 * fiche du poste est celle d'un envoi, et deux envois d'une commande ont
 * chacun leur décision, leur reste et leur BL.
 */
export interface ShipmentAftermath extends ShortfallAftermath {
  readonly orderId: string;
  readonly rank: number;
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
  /** Parmi les envois de ces commandes, ceux au départ incomplet décidé — un par envoi. */
  abstract among(orderIds: readonly string[]): Promise<readonly ShipmentAftermath[]>;
}
