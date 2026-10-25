/**
 * Ce que le colisage a constaté :
 *
 * - `revised` — les lignes dues de la feuille disent la commande révisée (ou
 *   la disaient déjà : rien n'est écrit, rien n'est publié) ;
 * - `sheet_missing` — la liste à coliser n'a pas encore livré la feuille de
 *   cette commande : refus temporaire, à réessayer (§ 7, B2) ;
 * - `packed` — le bac est fermé : la commande est prête, rien n'est écrit ;
 * - `delivery_bin` — un contenant porte un bac de livraison vivant : une
 *   hausse pourrait ne plus y tenir, rien n'est écrit.
 *
 * Une baisse sous ce qui est déjà au bac n'est pas une issue : l'agrégat la
 * refuse (`RevisedDueBelowPackedError`), et l'appelant défait tout.
 */
export type PackingRevisionOutcome = "revised" | "sheet_missing" | "packed" | "delivery_bin";

/** Une ligne de la commande révisée : l'article et sa quantité due. */
export interface PackingDueLine {
  readonly sku: string;
  readonly quantity: number;
}

/**
 * **Le guichet de la révision au colisage** (plan A2,
 * `documentation/commandes/modification/plan-a2-modifier-une-commande-inscrite.md`,
 * § 2.2 et § 7) — déclaré ET implémenté par le colisage, appelé par le
 * commerce quand l'équipe change les quantités d'une commande déjà inscrite.
 * Même figure que {@link PackingWithdrawalDesk} (A1).
 *
 * 🔴 **Dans l'unité de travail de l'appelant**, APRÈS le guichet du fournil :
 * ordre des verrous ligne `orders` → journée → feuille → BL. Un refus de
 * l'appelant ensuite défait tout, feuille comprise.
 *
 * `packing → b2b` reste interdit : le colisage ne sait pas qui l'appelle.
 */
export abstract class PackingRevisionDesk {
  /**
   * Révise les lignes dues de la feuille, ou dit pourquoi elle ne se révise pas.
   *
   * @param lines la composition révisée entière, un article par ligne.
   * @param revisedBy l'auteur de la révision, qui signe une ligne devenue
   *   complète — opaque pour le colisage.
   */
  abstract revise(
    serviceDay: string,
    orderId: string,
    lines: readonly PackingDueLine[],
    revisedBy: string,
  ): Promise<PackingRevisionOutcome>;
}
