import { sanitiseSubject, type RenderedMail } from "@lfd/mailer";

import { DEFAULT_MAIL_LOCALE, mailCopyOf } from "./copy/mail-copy.js";
import type { StaffShell } from "./customer-request-mail.js";

/** Une annonce aux abonnés de la vitrine — texte brut, écrit au back-office. */
export interface VitrineNoticeMailData {
  readonly subject: string;
  readonly message: string;
}

/**
 * **L'annonce à l'agence de la vitrine** (plan vitrine §7, Hugo 2026-10-18).
 *
 * Sous la coquille de la MAISON (`La Folie Douce`) : l'agence travaille pour
 * elle, pas pour un client de la boutique. Le message est du texte brut que
 * la coquille échappe ; l'objet est assaini. Pas de bouton : l'agence n'a pas
 * d'accès au back-office.
 */
export function renderVitrineNoticeMail(
  data: VitrineNoticeMailData,
  shell: StaffShell,
): RenderedMail {
  return {
    subject: sanitiseSubject(data.subject),
    html: shell({
      title: data.subject,
      body: data.message,
      footer: mailCopyOf(DEFAULT_MAIL_LOCALE)["agency.vitrine-notice"].footer,
    }),
  };
}
