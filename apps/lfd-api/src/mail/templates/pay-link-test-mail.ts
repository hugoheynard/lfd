import { sanitiseSubject, type LayoutInput, type RenderedMail } from "@lfd/mailer";

import { DEFAULT_MAIL_LOCALE, mailCopyOf } from "./copy/mail-copy.js";
import type { MailBody } from "./mail-logo.js";

/**
 * Les données du **lien de paiement d'essai** (doc
 * `documentation/payment/les-liens-de-paiement.md`, « Le lien d'essai ») :
 * l'adresse `/payer/…` d'un vrai lien de 1 €, envoyée à un membre du staff.
 * Le montant n'y est pas : il est fixé par le sujet, et l'e-mail le dit dans
 * ses textes.
 */
export interface PayLinkTestMailData {
  /** L'adresse publique du lien, jeton compris. */
  readonly payUrl: string;
}

/** La coquille de la maison, celle des e-mails à l'équipe. */
type StaffShell = (input: Omit<LayoutInput, "brand" | "supportEmail">) => MailBody;

/** Le rendu : un essai, dit comme tel, et le bouton vers la page de paiement. */
export function renderPayLinkTestMail(data: PayLinkTestMailData, shell: StaffShell): RenderedMail {
  const copy = mailCopyOf(DEFAULT_MAIL_LOCALE)["staff.pay-link-test"];
  return {
    subject: sanitiseSubject(copy.subject),
    ...shell({
      kicker: copy.kicker,
      title: copy.title,
      body: `${copy.intro}\n\n${copy.refund}`,
      cta: { label: copy.cta, url: data.payUrl },
      footer: copy.footer,
    }),
  };
}
