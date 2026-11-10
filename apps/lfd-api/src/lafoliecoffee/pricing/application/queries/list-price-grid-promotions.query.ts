import type { PriceGridQuestion } from "@lfd/contracts";

/**
 * « Quelles promotions ce public reçoit-il, à cette date, pour cet
 * acheminement ? » — la lecture qui remplit le panneau d'export de la grille
 * de prix (`plan-export-grille-de-prix.md`, § 2.4).
 */
export class ListPriceGridPromotionsQuery {
  constructor(readonly question: PriceGridQuestion) {}
}
