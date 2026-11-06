import type { NoticeAddress } from "../services/collection-notice-recipient.js";

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
  /**
   * Dans un ordre stable (société, puis ancienneté), chaque adresse avec qui
   * elle désigne (`contact:<id>`, `user:<id>`) ; doublons possibles,
   * l'appelant dédoublonne.
   */
  abstract billingContactsOf(
    orderIds: readonly string[],
    payerCompanyId: string,
  ): Promise<readonly NoticeAddress[]>;
}
