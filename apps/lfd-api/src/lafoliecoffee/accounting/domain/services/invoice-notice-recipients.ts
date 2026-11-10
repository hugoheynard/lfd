import type { NoticeAddress, PayerNoticeContacts } from "./collection-notice-recipient.js";
import { payerNoticeRecipientOf } from "./collection-notice-recipient.js";

/** D'où vient une adresse — jamais l'adresse elle-même dans le journal. */
export type InvoiceRecipientSource = "billing_contact" | "owner" | "site_billing";

export interface InvoiceRecipient {
  /**
   * Qui l'adresse désigne, sans l'adresse (`contact:<id>`, `user:<id>`) : la
   * clé de l'e-mail le porte, et un rejeu dont la liste a changé ne tait plus
   * un destinataire décalé (revue du service d'e-mails, cas 4).
   */
  readonly id: string;
  readonly email: string;
  readonly source: InvoiceRecipientSource;
}

/**
 * **À qui part « Votre facture FA-… »** (Q3, Hugo, 2026-10-08) :
 *
 * - au payeur légal, comme l'avis de prélèvement (PA2) : son contact de
 *   facturation le plus ancien, à défaut son détenteur ;
 * - **et** aux rôles facturation des sous-comptes dont des bons figurent sur
 *   la facture (`siteBillingEmails`, déjà restreints par le port).
 *
 * Dédoublonné sans tenir compte de la casse : une même boîte ne reçoit
 * qu'un message, sous la première source qui l'a nommée (et son identifiant). Une adresse vide ou
 * sans arobase est écartée, jamais devinée. Liste vide : personne à prévenir,
 * et l'appelant le signale.
 */
export function invoiceNoticeRecipients(
  payer: PayerNoticeContacts | undefined,
  siteBillingContacts: readonly NoticeAddress[],
): readonly InvoiceRecipient[] {
  const recipients: InvoiceRecipient[] = [];
  const seen = new Set<string>();
  const add = (address: NoticeAddress, source: InvoiceRecipientSource): void => {
    const trimmed = address.email.trim();
    const key = trimmed.toLowerCase();
    if (trimmed.length === 0 || !trimmed.includes("@") || seen.has(key)) {
      return;
    }
    seen.add(key);
    recipients.push({ id: address.id, email: trimmed, source });
  };
  const head = payerNoticeRecipientOf(payer);
  if (head !== null) {
    add(head, head.source);
  }
  for (const contact of siteBillingContacts) {
    add(contact, "site_billing");
  }
  return recipients;
}
