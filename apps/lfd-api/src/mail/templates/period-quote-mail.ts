import type { ContentLocale } from "@lfd/contracts";
import { sanitiseSubject, type LayoutInput, type LayoutRow, type RenderedMail } from "@lfd/mailer";

import type { PeriodQuoteCopy } from "./copy/mail-copy.model.js";
import { fill, mailCopyOf } from "./copy/mail-copy.js";
import type { MailBody } from "./mail-logo.js";

/**
 * Les données de l'e-mail **« Devis D-… »** (plan
 * `documentation/comptabilite/facturation/plan-clients-publics-chorus.md`,
 * § 6 sexies, QD4) : le devis de période d'un organisme public, qui le
 * retourne avec son numéro d'engagement pour que la facture parte.
 * Destinataire : le contact de facturation du payeur, sinon son détenteur.
 * Tout est déjà mis en forme : le gabarit ne calcule rien.
 *
 * Le PDF part toujours : un devis sans son document n'aurait rien à
 * retourner, et l'envoi n'est pas demandé sans lui.
 */
export interface PeriodQuoteMailData {
  /** `D-20261031-1`. */
  readonly quoteNumber: string;
  readonly version: number;
  readonly sellerName: string;
  /** Le payeur — l'organisme à qui le devis est adressé. */
  readonly buyerName: string;
  /** « du 01/10/2026 au 31/10/2026 ». */
  readonly period: string;
  /** « 1 234,56 € ». */
  readonly total: string;
  /** Le code service des commandes ; `null` : aucun. */
  readonly serviceCode: string | null;
  readonly document: PeriodQuoteMailDocument;
  /**
   * La langue des mots du gabarit. ⚠️ Rien ne choisit encore la langue d'un
   * client : l'appelant passe `DEFAULT_MAIL_LOCALE` (cf. `mail-copy.ts`).
   */
  readonly locale: ContentLocale;
}

/** La pièce jointe : le nom remis et les octets du PDF rangé. */
export interface PeriodQuoteMailDocument {
  /** `D-20261031-1-v1.pdf`. */
  readonly fileName: string;
  readonly pdfBase64: string;
}

/** La coquille client, prêtée par le registre. */
export type PeriodQuoteShell = (input: Omit<LayoutInput, "brand" | "supportEmail">) => MailBody;

/**
 * Le rendu, à part de `mail-templates.ts`. Ce qu'un service comptable lit
 * pour engager son budget : le devis, la période, le montant, et ce qu'il
 * doit renvoyer. Les mots viennent du dictionnaire.
 */
export function renderPeriodQuoteMail(
  data: PeriodQuoteMailData,
  shell: PeriodQuoteShell,
): RenderedMail {
  const copy = mailCopyOf(data.locale)["customer.period-quote"];
  const title = fill(copy.title, { number: data.quoteNumber });
  return {
    subject: sanitiseSubject(fill(copy.subject, { title, seller: data.sellerName })),
    ...shell({
      kicker: copy.kicker,
      title,
      body: bodyOf(data, copy),
      rows: rowsOf(data, copy),
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

function bodyOf(data: PeriodQuoteMailData, copy: PeriodQuoteCopy): string {
  const intro = fill(copy.intro, {
    seller: data.sellerName,
    number: data.quoteNumber,
    buyer: data.buyerName,
    period: data.period,
    total: data.total,
  });
  return `${copy.greeting}\n\n${intro}\n\n${copy.notAnInvoice}\n\n${copy.returnRequest}`;
}

function rowsOf(data: PeriodQuoteMailData, copy: PeriodQuoteCopy): readonly LayoutRow[] {
  return [
    { label: copy.quoteLabel, value: data.quoteNumber },
    { label: copy.versionLabel, value: String(data.version) },
    { label: copy.periodLabel, value: data.period },
    { label: copy.addressedToLabel, value: data.buyerName },
    ...(data.serviceCode === null
      ? []
      : [{ label: copy.serviceCodeLabel, value: data.serviceCode }]),
    { label: copy.totalLabel, value: data.total, strong: true },
  ];
}
