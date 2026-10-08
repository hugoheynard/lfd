import type { PayerNoticeContacts } from "./collection-notice-recipient.js";
import { noticeRecipientOf } from "./collection-notice-recipient.js";

/** D'où vient une adresse — jamais l'adresse elle-même dans le journal. */
export type InvoiceRecipientSource = "billing_contact" | "owner" | "site_billing";

export interface InvoiceRecipient {
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
 * qu'un message, sous la première source qui l'a nommée. Une adresse vide ou
 * sans arobase est écartée, jamais devinée. Liste vide : personne à prévenir,
 * et l'appelant le signale.
 */
export function invoiceNoticeRecipients(
  payer: PayerNoticeContacts | undefined,
  siteBillingEmails: readonly string[],
): readonly InvoiceRecipient[] {
  const recipients: InvoiceRecipient[] = [];
  const seen = new Set<string>();
  const add = (email: string, source: InvoiceRecipientSource): void => {
    const trimmed = email.trim();
    const key = trimmed.toLowerCase();
    if (trimmed.length === 0 || !trimmed.includes("@") || seen.has(key)) {
      return;
    }
    seen.add(key);
    recipients.push({ email: trimmed, source });
  };
  const head = noticeRecipientOf(payer);
  if (head !== null) {
    add(head.email, head.source);
  }
  for (const email of siteBillingEmails) {
    add(email, "site_billing");
  }
  return recipients;
}
