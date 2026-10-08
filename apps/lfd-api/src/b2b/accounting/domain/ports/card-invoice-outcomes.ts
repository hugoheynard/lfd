/** Ce que la facture carte retient d'une commande. */
export interface CardInvoiceOutcomeKey {
  readonly orderId: string;
  readonly orderNumber: string;
  /** L'entité émettrice ; `null` quand aucune ne pouvait émettre. */
  readonly legalEntityId: string | null;
  readonly payerCompanyId: string;
  readonly payerName: string;
  readonly at: Date;
}

/**
 * **L'issue de la facture carte, par commande** (lot E5a) : émise ou
 * signalée. Rien n'est avalé — un refus est RANGÉ, l'écran le lit et
 * « Réessayer » le rejoue. La base tient qu'une issue émise ne redevient
 * jamais signalée (`card_invoice_outcome_final`).
 */
export abstract class CardInvoiceOutcomes {
  /** Dans la transaction de l'émission : la facture et son issue partent ensemble. */
  abstract recordIssued(key: CardInvoiceOutcomeKey, invoiceId: string): Promise<void>;

  /** Le refus en clair ; remplace un refus antérieur de la même commande. */
  abstract recordBlocked(key: CardInvoiceOutcomeKey, message: string): Promise<void>;
}
