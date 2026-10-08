/** Un remboursement RÉUSSI d'une commande, et l'avoir qui le constate s'il existe. */
export interface CreditableRefund {
  /** L'id de la ligne `order_refund` — jamais le `re_…` de Stripe. */
  readonly refundId: string;
  readonly amountCents: number;
  readonly creditNoteId: string | null;
}

/** Lecture des remboursements à avoiriser (lot E5b). */
export abstract class RefundsToCreditReader {
  /** Les remboursements `succeeded` de la commande, dans l'ordre de leur constat. */
  abstract succeededOf(orderId: string): Promise<readonly CreditableRefund[]>;
}

/**
 * Écriture du lien remboursement → avoir (lot E5b), dans la transaction de
 * l'avoir. Posé UNE fois : la base refuse de le réécrire
 * (`order_refund_credit_note_once`).
 */
export abstract class RefundCreditLinks {
  abstract link(refundId: string, creditNoteId: string): Promise<void>;
}
