import type { ClientSheet, ContentLocale } from "@lfd/contracts";
import { sanitiseSubject, type LayoutRow, type RenderedMail } from "@lfd/mailer";

import { fill, mailCopyOf } from "./copy/mail-copy.js";
import { orderTotalFormOf } from "./order-total-form.js";
import type { OrderChangeAnswerShell } from "./order-change-answer-mail.js";
import { withAttachments, type OrderSheetMailDocument } from "./order-sheet-mail-document.js";

/**
 * **Ce que l'argent devient après la modification**, décidé par le commerce
 * sur le règlement de la commande (doc `modifier-une-commande.md`, § 2.8) :
 *
 * - `invoice` : au compte ou à total nul, la facture portera le nouveau total ;
 * - `card_charged` : carte, total en hausse — la différence est déjà payée ;
 * - `card_refunded` : carte, total en baisse — la différence sera rendue ;
 * - `none` : total égal, rien à dire sur l'argent.
 */
export type OrderRevisedMoneyNote = "invoice" | "card_charged" | "card_refunded" | "none";

/**
 * Les données de `customer.order-revised` — « Votre commande est modifiée ».
 * Les deux totaux sont ceux de la révision (le fait `order.revised`), jamais
 * recalculés ici ; la feuille est celle de la révision courante.
 */
export interface OrderRevisedMailData {
  readonly sheet: ClientSheet;
  /** Total TTC avant la révision, en centimes. */
  readonly previousTotalCents: number;
  /** Total TTC après la révision, en centimes. */
  readonly totalCents: number;
  /**
   * Les HT avant et après, en centimes — dits à un pro ({@link orderTotalFormOf}).
   * `null` quand le fait de la révision ne les porte pas : le TTC seul est dit.
   */
  readonly previousPretaxCents: number | null;
  readonly pretaxCents: number | null;
  readonly moneyNote: OrderRevisedMoneyNote;
  /** « Voir ma commande » : CETTE commande ; vide sans origine connue, et pas de bouton. */
  readonly orderUrl: string;
  /** Le bon révisé, joint — ou `null` si son rendu ou son rangement a échoué. */
  readonly document: OrderSheetMailDocument | null;
  readonly locale: ContentLocale;
}

/**
 * « Votre commande est modifiée. » Le détail à jour reprend le récapitulatif
 * de la passation (`recap`, prêté par le registre) : un courriel qui
 * recomposerait l'information ferait douter qu'il parle de la même commande.
 */
export function renderOrderRevisedMail(
  data: OrderRevisedMailData,
  shell: OrderChangeAnswerShell,
  recap: readonly LayoutRow[],
): RenderedMail {
  const copy = mailCopyOf(data.locale)["customer.order-revised"];
  const ref = data.sheet.reference;
  const paragraphs = [fill(copy.intro, { ref }), totalLine(data), moneyLine(data)].filter(
    (line) => line !== "",
  );
  return {
    subject: sanitiseSubject(fill(copy.subject, { ref })),
    ...shell({
      kicker: copy.kicker,
      title: copy.title,
      body: paragraphs.join("\n\n"),
      rows: recap,
      ...(data.orderUrl === "" ? {} : { cta: { label: copy.cta, url: data.orderUrl } }),
      footer: copy.footer,
    }),
    ...withAttachments(
      data.document === null
        ? []
        : [
            {
              filename: data.document.fileName,
              contentBase64: data.document.pdfBase64,
              contentType: "application/pdf",
            },
          ],
    ),
  };
}

/** L'ancien et le nouveau total, ou le total qui reste — écrits selon la clientèle et le règlement. */
function totalLine(data: OrderRevisedMailData): string {
  const copy = mailCopyOf(data.locale)["customer.order-revised"];
  const total = amountOf(data, data.totalCents, data.pretaxCents);
  if (data.totalCents === data.previousTotalCents) {
    return fill(copy.sameTotal, { total });
  }
  const previous = amountOf(data, data.previousTotalCents, data.previousPretaxCents);
  return fill(copy.totalShift, { previous, total });
}

/**
 * Un total : le HT seul d'un pro au compte, le TTC puis le HT d'un pro qui
 * paie par carte, le TTC seul d'un particulier — ou d'un fait sans HT.
 */
function amountOf(
  data: OrderRevisedMailData,
  withTaxCents: number,
  pretaxCents: number | null,
): string {
  const copy = mailCopyOf(data.locale)["customer.order-revised"];
  const withTax = euros(withTaxCents, data.locale);
  const form = orderTotalFormOf(data.sheet);
  if (pretaxCents === null || form === "with_tax") {
    return withTax;
  }
  const pretax = euros(pretaxCents, data.locale);
  return form === "pretax"
    ? fill(copy.pretaxAmount, { pretax })
    : fill(copy.bothAmounts, { withTax, pretax });
}

/** La phrase sur l'argent ; vide quand rien ne bouge. L'écart est en TTC : le montant payé ou rendu. */
function moneyLine(data: OrderRevisedMailData): string {
  const copy = mailCopyOf(data.locale)["customer.order-revised"];
  const amount = euros(Math.abs(data.totalCents - data.previousTotalCents), data.locale);
  switch (data.moneyNote) {
    case "invoice":
      return copy.invoice;
    case "card_charged":
      return fill(copy.cardCharged, { amount });
    case "card_refunded":
      return fill(copy.cardRefunded, { amount });
    case "none":
      return "";
  }
}

/** Un montant en centimes, dans la langue du destinataire — comme les autres courriels de commande. */
function euros(cents: number, locale: ContentLocale): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);
}
