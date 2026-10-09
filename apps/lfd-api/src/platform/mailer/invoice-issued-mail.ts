import type { ContentLocale } from "@lfd/contracts";
import { sanitiseSubject, type LayoutInput, type LayoutRow, type RenderedMail } from "@lfd/mailer";

import type { InvoiceIssuedCopy } from "./copy/mail-copy.model.js";
import { fill, mailCopyOf } from "./copy/mail-copy.js";

/**
 * Les données de l'e-mail **« Votre facture FA-… »** (plan
 * `documentation/comptabilite/facturation/facture-emise.md`, Q3).
 * Destinataires : le contact de facturation du payeur légal (sinon son
 * détenteur) et les rôles facturation des sous-comptes dont des bons
 * figurent sur la facture. Tout est déjà mis en forme : le gabarit ne
 * calcule rien.
 *
 * Le PDF/A-3 Factur-X (E3b) part en pièce jointe quand il est rendu : l'envoi
 * attend le rendu. `document: null` — un rendu en échec, journalisé — laisse
 * partir l'e-mail sans pièce, et la facture reste dans « Mes factures ».
 */
export interface InvoiceIssuedMailData {
  readonly invoiceNumber: string;
  readonly sellerName: string;
  /** Le payeur légal — la société à qui la facture est adressée. */
  readonly buyerName: string;
  /** « mercredi 30 septembre 2026 ». */
  readonly issuedOn: string;
  /** « septembre 2026 » ; `null` hors facture du mois. */
  readonly period: string | null;
  /** « 1 234,56 € ». */
  readonly total: string;
  /** « jeudi 15 octobre 2026 ». */
  readonly dueOn: string;
  /** « Prélèvement SEPA — mandat RUM-… », ou `null` : aucun moyen figé sur la facture. */
  readonly paymentMeans: string | null;
  /** Le lien vers « Mes factures » ; vide quand l'origine de la boutique n'est pas connue. */
  readonly invoicesUrl: string;
  /** Le PDF/A-3 Factur-X de la facture, ou `null` : rendu en échec, l'e-mail part sans. */
  readonly document: InvoiceMailDocument | null;
  /**
   * La langue des mots du gabarit. ⚠️ Rien ne choisit encore la langue d'un
   * client : l'appelant passe `DEFAULT_MAIL_LOCALE` (cf. `mail-copy.ts`).
   */
  readonly locale: ContentLocale;
}

/** La pièce jointe : le nom remis au client et les octets du PDF rangé. */
export interface InvoiceMailDocument {
  /** `FA-2026-000001.pdf`. */
  readonly fileName: string;
  readonly pdfBase64: string;
}

/** La coquille client, prêtée par le registre. */
export type InvoiceShell = (input: Omit<LayoutInput, "brand" | "supportEmail">) => string;

/**
 * Le rendu, à part de `mail-templates.ts`. Sobre : le numéro, les dates, le
 * montant, comment il sera réglé — ce qu'un service comptable reporte sans
 * ouvrir autre chose. Les mots viennent du dictionnaire (`invoiceIssued`).
 */
export function renderInvoiceIssuedMail(
  data: InvoiceIssuedMailData,
  shell: InvoiceShell,
): RenderedMail {
  const copy = mailCopyOf(data.locale).invoiceIssued;
  const title = fill(copy.title, { number: data.invoiceNumber });
  return {
    subject: sanitiseSubject(fill(copy.subject, { title, seller: data.sellerName })),
    html: shell({
      title,
      body: bodyOf(data, copy),
      rows: rowsOf(data, copy),
      ...(data.invoicesUrl === "" ? {} : { cta: { label: copy.cta, url: data.invoicesUrl } }),
      footer: copy.footer,
    }),
    ...(data.document === null
      ? {}
      : {
          attachments: [
            {
              filename: data.document.fileName,
              contentBase64: data.document.pdfBase64,
              contentType: "application/pdf",
            },
          ],
        }),
  };
}

function bodyOf(data: InvoiceIssuedMailData, copy: InvoiceIssuedCopy): string {
  const period = data.period === null ? "" : fill(copy.periodClause, { period: data.period });
  const intro = fill(copy.intro, {
    seller: data.sellerName,
    number: data.invoiceNumber,
    buyer: data.buyerName,
    period,
    total: data.total,
  });
  return (
    `${copy.greeting}\n\n${intro}` + (data.document === null ? "" : `\n\n${copy.attachedNote}`)
  );
}

function rowsOf(data: InvoiceIssuedMailData, copy: InvoiceIssuedCopy): readonly LayoutRow[] {
  return [
    { label: copy.invoiceLabel, value: data.invoiceNumber },
    { label: copy.dateLabel, value: data.issuedOn },
    ...(data.period === null ? [] : [{ label: copy.periodLabel, value: data.period }]),
    { label: copy.addressedToLabel, value: data.buyerName },
    { label: copy.dueLabel, value: data.dueOn },
    ...(data.paymentMeans === null ? [] : [{ label: copy.paymentLabel, value: data.paymentMeans }]),
    { label: copy.totalLabel, value: data.total, strong: true },
  ];
}
