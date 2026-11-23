import type { CardRefundNature } from "../../card/domain/value-objects/card-refund-values.js";

/** Un remboursement réussi d'un sujet, sans paiement ni prestataire. */
export interface SubjectSucceededRefund {
  readonly subjectId: string;
  /** L'instant du prestataire pour un `provider`, celui du geste pour un `manual`. */
  readonly refundedAt: Date;
  /** Le montant rendu, TTC, en centimes : un remboursement n'a ni ligne ni TVA. */
  readonly amountCents: number;
  /** `null` pour un remboursement fait hors de la plateforme, sans demande ni nature. */
  readonly nature: CardRefundNature | null;
}

/**
 * **Les remboursements réussis de sujets, par lot** — déclaré ET implémenté
 * par `payment`, pour un lecteur qui n'a besoin que de l'argent rendu
 * (l'export des ventes) : un port étroit (ISP), là où `CardSettlementReader`
 * rend paiements, demandes et positions.
 *
 * « Réussi » se lit comme la position du sujet le compte au remboursé
 * (`refundedCents`) : le statut `succeeded`, et lui seul. N'écrit jamais.
 */
export abstract class SucceededCardRefundsReader {
  /**
   * Les remboursements réussis des sujets `subjectType` dont l'identifiant
   * est dans `subjectIds`, par instant de remboursement croissant ; un sujet
   * sans remboursement est absent de la réponse.
   */
  abstract succeededOf(
    subjectType: string,
    subjectIds: readonly string[],
  ): Promise<readonly SubjectSucceededRefund[]>;
}
