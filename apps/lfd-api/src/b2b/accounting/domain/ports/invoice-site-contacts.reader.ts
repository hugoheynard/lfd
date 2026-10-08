/**
 * Les adresses des **rôles facturation des sous-comptes** dont des bons
 * figurent sur une facture (Q3, lot E6) : pour chaque société qui a passé
 * l'un de ces bons, sauf le payeur lui-même, ses contacts au rôle `billing`
 * et ses membres au rôle `billing`.
 *
 * Port à part de `PayerNoticeContactsReader` (ISP) : l'avis de prélèvement
 * ne connaît que le payeur.
 */
export abstract class InvoiceSiteContactsReader {
  /** Dans un ordre stable (société, puis ancienneté) ; doublons possibles, l'appelant dédoublonne. */
  abstract billingEmailsOf(
    orderIds: readonly string[],
    payerCompanyId: string,
  ): Promise<readonly string[]>;
}
