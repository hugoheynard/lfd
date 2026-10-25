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
  /**
   * Ce que le retrait a rendu à la réserve, article par article (lot A1.4) —
   * vide quand rien n'était au bac, ou que la feuille n'était pas tirée.
   * C'est ce que « Envoyer en boutique » propose.
   */
  readonly released: readonly ReleasedToReserveLine[];
}

/** Une ligne rendue à la réserve par le retrait d'une feuille (plan A1, lot A1.4). */
export interface ReleasedToReserveLine {
  readonly sku: string;
  readonly productName: string;
  /** Les pièces rendues par CE retrait. */
  readonly quantity: number;
  /**
   * Le libre de la réserve pour cet article, à la lecture — ce qui peut
   * encore en sortir : la borne de l'envoi en boutique.
   */
  readonly free: number;
}
