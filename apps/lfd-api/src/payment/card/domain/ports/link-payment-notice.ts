/** Un paiement venu d'un lien, tel qu'il vient d'être enregistré encaissé. */
export interface LinkPaymentReceipt {
  readonly paymentId: string;
  readonly payLinkId: string;
  readonly subjectType: string;
  readonly subjectId: string;
  /** Le compte qui a encaissé (`lfc-stripe`). */
  readonly account: string;
  readonly amountCents: number;
  /** Vrai : le sujet a refusé l'encaissement, et demandera le remboursement. */
  readonly refused: boolean;
}

/**
 * **L'avis à l'équipe d'un paiement reçu par un lien** (plan
 * `plan-le-lien-vers-un-sujet.md`, §2.4). Déclaré par l'encaissement, qui
 * sait QUAND un paiement est encaissé ; implémenté par les liens
 * (`payment/link/`), qui savent ce que le lien dit de son payeur et de son
 * origine.
 *
 * Appelé dans la transaction qui écrit le paiement : l'avis est demandé avec
 * l'écriture, ou pas du tout.
 */
export abstract class LinkPaymentNotice {
  abstract paid(receipt: LinkPaymentReceipt): Promise<void>;
}
