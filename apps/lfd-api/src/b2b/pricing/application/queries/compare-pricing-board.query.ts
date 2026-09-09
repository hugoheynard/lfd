/**
 * « Qu'est-ce qui a bougé entre ces deux marqueurs, et de combien ? »
 *
 * Une question à part et non deux lectures datées recollées dans le navigateur :
 * le volume se mesure sur la fenêtre QUI SÉPARE les marqueurs, et cette fenêtre
 * n'existe dans aucune des deux lectures.
 */
export class ComparePricingBoardQuery {
  constructor(
    readonly from: Date,
    readonly to: Date,
  ) {}
}
