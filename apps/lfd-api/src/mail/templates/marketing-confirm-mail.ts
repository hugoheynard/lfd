import type { ContentLocale } from "@lfd/contracts";
import { sanitiseSubject, type RenderedMail } from "@lfd/mailer";

import { mailCopyOf } from "./copy/mail-copy.js";
import type { CustomerShell } from "./delivery-en-route-mail.js";

/**
 * Les données de **« Confirmez votre inscription »** (plan
 * `documentation/mail/la-desinscription-et-l-accord.md`, règle 18, C1) —
 * la double confirmation d'un accord recueilli sur une adresse non vérifiée.
 * Posées par le bloc `mail` lui-même (`MarketingConsent.request`).
 */
export interface MarketingConfirmMailData {
  /** Le lien signé, valable 7 jours, une seule fois. */
  readonly confirmUrl: string;
  /** La langue de la case cochée — celle de la personne. */
  readonly locale: ContentLocale;
}

/**
 * Le rendu. Un e-mail **transactionnel** : il répond au geste de la personne
 * (une case cochée), il ne vend rien — il part donc sans pied de
 * désinscription, et ne lit pas le registre. Ne pas cliquer suffit à ne rien
 * recevoir : la demande expire seule.
 */
export function renderMarketingConfirmMail(
  data: MarketingConfirmMailData,
  shell: CustomerShell,
): RenderedMail {
  const copy = mailCopyOf(data.locale)["customer.marketing-confirm"];
  return {
    subject: sanitiseSubject(copy.subject),
    ...shell({
      kicker: copy.kicker,
      title: copy.title,
      body: `${copy.intro}\n\n${copy.validity}`,
      cta: { label: copy.cta, url: data.confirmUrl },
      footer: copy.footer,
    }),
  };
}
