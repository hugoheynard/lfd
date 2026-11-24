import type { ContentLocale } from "@lfd/contracts";
import { sanitiseSubject, type RenderedMail } from "@lfd/mailer";

import { fill, mailCopyOf } from "./copy/mail-copy.js";
import type { CustomerShell } from "./delivery-en-route-mail.js";

/**
 * Les données de l'e-mail **« Nos conditions générales de vente changent »**
 * (plan `commandes/paniers-recurrents/plan-bloc-recurrent.md`, § 7).
 * Destinataire : l'acheteur d'un panier récurrent actif ou en pause, à la
 * publication d'une nouvelle version des CGV — le dépôt de son PDF.
 *
 * Le PDF de la nouvelle version part en pièce jointe : c'est l'exemplaire
 * déposé, joint par référence au stockage des documents client.
 */
export interface RecurringSalesTermsChangedMailData {
  /** Le jour où la nouvelle version s'applique, `AAAA-MM-JJ` (l'envoi + 30 jours). */
  readonly effectiveOn: string;
  /** « Mes paniers récurrents » ; vide quand l'adresse de la boutique n'est pas configurée. */
  readonly basketsUrl: string;
  /** Le PDF de la nouvelle version. */
  readonly document: RecurringSalesTermsMailDocument;
  readonly locale: ContentLocale;
}

/** La pièce jointe : le nom remis au client et les octets du PDF déposé. */
export interface RecurringSalesTermsMailDocument {
  readonly fileName: string;
  readonly pdfBase64: string;
}

/** La date d'effet, le PDF joint, et le geste de sortie : arrêter le panier, sans frais. */
export function renderRecurringSalesTermsChangedMail(
  data: RecurringSalesTermsChangedMailData,
  shell: CustomerShell,
): RenderedMail {
  const copy = mailCopyOf(data.locale)["customer.recurring-sales-terms-changed"];
  const intro = fill(copy.intro, { date: dateInWords(data.effectiveOn, data.locale) });
  return {
    subject: sanitiseSubject(copy.subject),
    ...shell({
      kicker: copy.kicker,
      title: copy.title,
      body: `${copy.greeting}\n\n${intro}\n\n${copy.attachedNote}\n\n${copy.stopAnytime}`,
      ...(data.basketsUrl === "" ? {} : { cta: { label: copy.cta, url: data.basketsUrl } }),
      footer: copy.footer,
    }),
    attachments: [
      {
        filename: data.document.fileName,
        contentBase64: data.document.pdfBase64,
        contentType: "application/pdf",
      },
    ],
  };
}

/** « 4 janvier 2027 » — un jour sans heure ni fuseau, donc lu et écrit en UTC. */
function dateInWords(day: string, locale: ContentLocale): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00.000Z`));
}
