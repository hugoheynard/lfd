/** Un bon réglé par virement, et la facture 380 qui le porte. */
export interface SettledOrderTrace {
  readonly orderId: string;
  /** Le virement que le bon cite (`order_collection.bank_transfer_id`). */
  readonly bankTransferId: string;
  /** `null` : aucune facture 380 ne porte ce bon. */
  readonly invoiceId: string | null;
  readonly invoiceNumber: string | null;
}

/** Un bon d'une facture et son encaissement ; l'absence de ligne vaut `due`. */
export interface InvoiceOrderTrace {
  readonly orderId: string;
  readonly settledByTransferId: string | null;
}

/** Une facture 380 et la trace de ses bons. */
export interface InvoiceTrace {
  readonly invoiceId: string;
  readonly number: string;
  readonly orders: readonly InvoiceOrderTrace[];
}

/**
 * Port de LECTURE de la **trace du virement côté facturation** — ce que le
 * contrôle de cohérence compare à ce que le bloc `payment` a enregistré
 * (plan `plan-le-virement-recu-dans-payment.md`, §3.6). Tables de la
 * comptabilité seulement.
 */
export abstract class BankTransferTraceReader {
  /** Les bons passés `settled_by_transfer` à partir de `since` (inclus). */
  abstract settledOrdersSince(since: Date): Promise<readonly SettledOrderTrace[]>;

  /** Les factures 380 demandées et leurs bons ; une inconnue est absente. */
  abstract invoicesOf(invoiceIds: readonly string[]): Promise<readonly InvoiceTrace[]>;
}
