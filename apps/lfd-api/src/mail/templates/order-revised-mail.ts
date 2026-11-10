import type { ClientSheet, ContentLocale } from "@lfd/contracts";
import { sanitiseSubject, type LayoutRow, type RenderedMail } from "@lfd/mailer";

import { fill, mailCopyOf } from "./copy/mail-copy.js";
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

/** L'ancien et le nouveau total, ou le total qui reste. */
function totalLine(data: OrderRevisedMailData): string {
  const copy = mailCopyOf(data.locale)["customer.order-revised"];
  const total = euros(data.totalCents, data.locale);
  if (data.totalCents === data.previousTotalCents) {
    return fill(copy.sameTotal, { total });
  }
  return fill(copy.totalShift, { previous: euros(data.previousTotalCents, data.locale), total });
}

/** La phrase sur l'argent ; vide quand rien ne bouge. */
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
