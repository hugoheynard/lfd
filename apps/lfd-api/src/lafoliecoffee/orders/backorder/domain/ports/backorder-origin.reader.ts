/** Une ligne de la commande d'origine : l'article, la quantité commandée, son unité. */
export interface BackorderOriginLine {
  readonly sku: string;
  /** Des pièces, ou des GRAMMES au poids, comme `order_line.quantity`. */
  readonly quantity: number;
  readonly saleUnit: string;
}

/** Ce que la naissance d'un reliquat recopie de la commande d'origine. */
export interface BackorderOrigin {
  /** `null` : commande d'un particulier, sans société. */
  readonly companyId: string | null;
  readonly buyerUserId: string;
  readonly lines: readonly BackorderOriginLine[];
}

/**
 * Port de **lecture** de l'origine d'un reliquat (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, § 3) :
 * la société, l'acheteur et les lignes commandées.
 *
 * Lu APRÈS le verrou de la commande que la décision du départ a déjà pris
 * (`ShortfallDecisionRepository.lockSubject`), dans la même unité de
 * travail : il ne pose aucun verrou lui-même.
 */
export abstract class BackorderOriginReader {
  /** `null` : commande inconnue. */
  abstract ofLocked(orderId: string): Promise<BackorderOrigin | null>;
}
