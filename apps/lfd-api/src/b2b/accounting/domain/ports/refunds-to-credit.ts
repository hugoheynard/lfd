/** La nature d'un remboursement par carte : la vente n'a pas lieu, ou le montant dû a baissé. */
export type CreditableRefundNature = "return" | "adjustment";

/**
 * Un remboursement RÉUSSI d'une commande, et son rapprochement s'il existe
 * (plan `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
 * §5.1, §6.1).
 */
export interface CreditableRefund {
  /** L'id de la ligne `card_payment.refund` — jamais le `re_…` du prestataire. */
  readonly refundId: string;
  readonly amountCents: number;
  /** `null` : un remboursement fait hors de la plateforme, sans demande — traité en `return`. */
  readonly nature: CreditableRefundNature | null;
  /** L'avoir qui le constate, s'il y en a un. */
  readonly creditNoteId: string | null;
  /**
   * Déjà rapproché : une ligne `public.refund_credit` existe — un avoir, ou un
   * ajustement qui n'en appelle pas. Un rapprochement ne se refait jamais.
   */
  readonly reconciled: boolean;
}

/** Lecture des remboursements à avoiriser (lot E5b ; par `card-payment` depuis P1.c). */
export abstract class RefundsToCreditReader {
  /** Les remboursements `succeeded` de la commande, dans l'ordre de leur constat (`recordedAt, id`). */
  abstract succeededOf(orderId: string): Promise<readonly CreditableRefund[]>;
}

/**
 * Écriture du rapprochement d'un remboursement (lot E5b ; `public.refund_credit`
 * depuis P1.c), dans la transaction de l'avoir. Posé UNE fois : la base refuse
 * une seconde ligne pour le même remboursement, et de la réécrire.
 */
export abstract class RefundCreditLinks {
  /** L'avoir qui constate le remboursement (`reason = credit_note`). */
  abstract link(refundId: string, creditNoteId: string, at: Date): Promise<void>;

  /** Un remboursement d'ajustement : la facture est sur le montant baissé, pas d'avoir. */
  abstract noteAdjustment(refundId: string, at: Date): Promise<void>;
}
