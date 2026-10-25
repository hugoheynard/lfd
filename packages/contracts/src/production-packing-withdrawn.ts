/**
 * **Une feuille retirée du colisage** (plan A1,
 * `documentation/commandes/annulation/plan-a1-retirer-une-commande-inscrite.md`,
 * lot A1.3) — la commande a été annulée après l'arrêt du plan. Elle sort du
 * poste : ni à coliser, ni proposée, aucun geste. L'écran la montre à part,
 * sous le badge « annulée après l'arrêt », pour que l'équipe sache pourquoi
 * le compte à produire dépasse les feuilles, et que ce qui était au bac est
 * revenu à la réserve.
 */
export interface WithdrawnPackingSheet {
  readonly orderId: string;
  readonly reference: string;
  readonly customerLabel: string;
  /** L'instant du retrait, ISO. */
  readonly withdrawnAt: string;
}
