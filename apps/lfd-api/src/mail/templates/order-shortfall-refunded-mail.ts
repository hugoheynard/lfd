import type { ContentLocale } from "@lfd/contracts";
import { sanitiseSubject, type RenderedMail } from "@lfd/mailer";

import { fill, mailCopyOf } from "./copy/mail-copy.js";
import type { OrderShortfallShell } from "./order-shortfall-mail.js";

/**
 * **« Le reste vous a été remboursé »** — le reste d'un départ incomplet payé
 * par carte, rendu au solde (plan
 * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 7).
 * Destinataire : le client qui a passé la commande.
 *
 * Une part rendue = un courriel : le montant est celui que le prestataire a
 * confirmé pour CETTE part, jamais un total annoncé. Un remboursement « réglé
 * autrement » n'en envoie pas : rien ne dit au client ce qui lui a été rendu.
 */
export interface OrderShortfallRefundedMailData {
  /** Le numéro de la commande. */
  readonly reference: string;
  /** Le montant rendu par le prestataire, en centimes TTC. */
  readonly amountCents: number;
  readonly locale: ContentLocale;
}

/** « {amount} vous ont été remboursés sur votre carte », avec la ligne du montant. */
export function renderOrderShortfallRefundedMail(
  data: OrderShortfallRefundedMailData,
  shell: OrderShortfallShell,
): RenderedMail {
  const copy = mailCopyOf(data.locale)["customer.order-shortfall-refunded"];
  const amount = euros(data.amountCents, data.locale);
  return {
    subject: sanitiseSubject(fill(copy.subject, { ref: data.reference })),
    ...shell({
      kicker: copy.kicker,
      title: copy.title,
      body: `${fill(copy.intro, { amount, ref: data.reference })}\n\n${copy.delay}`,
      rows: [{ label: copy.amountLabel, value: amount }],
      footer: copy.footer,
    }),
  };
}

/** Un montant en centimes, dans la langue du destinataire — comme les autres courriels de commande. */
function euros(cents: number, locale: ContentLocale): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);
}
