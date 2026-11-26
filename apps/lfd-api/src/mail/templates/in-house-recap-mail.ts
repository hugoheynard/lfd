import type { ContentLocale } from "@lfd/contracts";
import { sanitiseSubject, type LayoutInput, type LayoutRow, type RenderedMail } from "@lfd/mailer";

import type { InHouseRecapCopy } from "./copy/mail-copy.model.js";
import { fill, mailCopyOf } from "./copy/mail-copy.js";
import type { MailBody } from "./mail-logo.js";

/**
 * Les données de l'e-mail **« Récapitulatif des BL »** d'un de nos
 * restaurants (`documentation/comptabilite/facturation/restaurants-maison.md`) :
 * à la place de la facture, les quantités remises sur un mois, sans
 * montant. Destinataire : le destinataire de la facture du payeur — son
 * contact de facturation, sinon son détenteur.
 *
 * Le PDF part toujours : c'est l'exemplaire rangé, joint par référence.
 */
export interface InHouseRecapMailData {
  /** Le restaurant — le payeur maison. */
  readonly payerName: string;
  /** Le mois civil de Paris, `AAAA-MM`. */
  readonly month: string;
  /** `RBL-202611-0001`. */
  readonly recapNumber: string;
  /** Le numéro que ce rectificatif remplace ; `null` pour une première émission. */
  readonly replacesNumber: string | null;
  readonly document: InHouseRecapMailDocument;
  /**
   * La langue des mots du gabarit. ⚠️ Rien ne choisit encore la langue d'un
   * client : l'appelant passe `DEFAULT_MAIL_LOCALE` (cf. `mail-copy.ts`).
   */
  readonly locale: ContentLocale;
}

/** La pièce jointe : le nom remis et les octets du PDF rangé. */
export interface InHouseRecapMailDocument {
  /** `RBL-202611-0001.pdf`. */
  readonly fileName: string;
  readonly pdfBase64: string;
}

/** La coquille client, prêtée par le registre. */
export type InHouseRecapShell = (input: Omit<LayoutInput, "brand" | "supportEmail">) => MailBody;

/** Le mois, le numéro, ce qu'il remplace, et qu'il n'appelle aucun paiement. */
export function renderInHouseRecapMail(
  data: InHouseRecapMailData,
  shell: InHouseRecapShell,
): RenderedMail {
  const copy = mailCopyOf(data.locale)["customer.in-house-recap"];
  const period = monthInWords(data.month, data.locale);
  const title = fill(copy.title, { number: data.recapNumber });
  return {
    subject: sanitiseSubject(fill(copy.subject, { title, period })),
    ...shell({
      kicker: copy.kicker,
      title,
      body: bodyOf(data, copy, period),
      rows: rowsOf(data, copy, period),
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

function bodyOf(data: InHouseRecapMailData, copy: InHouseRecapCopy, period: string): string {
  const intro = fill(copy.intro, { company: data.payerName, period });
  const rectification =
    data.replacesNumber === null
      ? []
      : [fill(copy.rectification, { replaced: data.replacesNumber })];
  return [copy.greeting, intro, ...rectification, copy.internalNote].join("\n\n");
}

function rowsOf(
  data: InHouseRecapMailData,
  copy: InHouseRecapCopy,
  period: string,
): readonly LayoutRow[] {
  return [
    { label: copy.recapLabel, value: data.recapNumber },
    { label: copy.periodLabel, value: period },
  ];
}

/** « novembre 2026 » — un mois sans fuseau, donc lu et écrit en UTC. */
function monthInWords(month: string, locale: ContentLocale): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00.000Z`));
}
