import { addDays, instantToLocal } from "@lfd/contracts";

import type { PeriodQuoteSnapshot } from "../entities/period-quote.js";
import {
  CONTENT_WIDTH,
  FOOTER_Y,
  type InvoiceSheet,
  LEFT,
  MM,
  MUTED,
  RIGHT,
  type TextStyle,
} from "./invoice-pdf-sheet.js";
import { day } from "./invoice-pdf-wording.js";
import type { InvoiceableOrder } from "./monthly-invoicing.js";
import type { PeriodQuoteSeller } from "./period-quote-pdf.js";

/**
 * **Les blocs du PDF d'un devis de période** (QD4) : l'en-tête qui dit que ce
 * n'est pas une facture, les parties, le code service et la mercuriale, la
 * demande de retour, les commandes chiffrées, le pied de page. Les lignes et
 * les totaux sont ceux de la facture (`invoice-pdf-lines.ts`,
 * `invoice-pdf-summary.ts`) : le devis montre ce que la facture imprimera.
 */

/** La mention qui fait du papier un devis : en tête de la page et au pied de chacune. */
export const NOT_AN_INVOICE = "Devis — ceci n'est pas une facture";
/** Ce que le payeur doit faire du devis. */
export const RETURN_REQUEST = "À retourner avec votre numéro d'engagement";

const TITLE: TextStyle = { size: 20, bold: true };
const BANNER: TextStyle = { size: 11, bold: true, color: "#9a1b1b" };
const BODY: TextStyle = { size: 9, width: CONTENT_WIDTH };
const LABEL: TextStyle = { size: 8, bold: true, color: MUTED };
const SECTION: TextStyle = { size: 10, bold: true };
const FOOT: TextStyle = { size: 7, color: MUTED, width: CONTENT_WIDTH, align: "center" };
const COLUMN = CONTENT_WIDTH / 2;
const GAP = 4 * MM;

/** « Devis D-20261031-1 — version 2 ». */
export function periodQuoteTitle(quote: Pick<PeriodQuoteSnapshot, "number" | "version">): string {
  return `Devis ${quote.number} — version ${String(quote.version)}`;
}

/** « du 01/10/2026 au 31/10/2026 » : la période du payeur, son dernier jour compris. */
export function periodQuotePeriod(
  quote: Pick<PeriodQuoteSnapshot, "periodStartsAt" | "periodClosesAt">,
): string {
  const first = instantToLocal(quote.periodStartsAt).day;
  const last = addDays(instantToLocal(quote.periodClosesAt).day, -1);
  return `du ${day(first)} au ${day(last)}`;
}

/** Le titre, la mention, le numéro et la version, la date et la période. */
export function drawPeriodQuoteHeader(sheet: InvoiceSheet, quote: PeriodQuoteSnapshot): void {
  const top = sheet.y;
  sheet.put("DEVIS", LEFT, top, TITLE);
  const facts = [
    `N° ${quote.number}`,
    `Version ${String(quote.version)}`,
    `Établi le ${day(instantToLocal(quote.createdAt).day)}`,
    `Période ${periodQuotePeriod(quote)}`,
  ].join("\n");
  const factsHeight = sheet.put(facts, RIGHT - COLUMN, top, {
    size: 9,
    width: COLUMN,
    align: "right",
  });
  sheet.advance(Math.max(sheet.heightOf("DEVIS", TITLE), factsHeight) + 2 * MM);
  sheet.advance(sheet.put(NOT_AN_INVOICE, LEFT, sheet.y, BANNER) + GAP);
}

/** Le vendeur et le payeur côte à côte, puis le code service et la mercuriale. */
export function drawPeriodQuoteParties(
  sheet: InvoiceSheet,
  quote: PeriodQuoteSnapshot,
  seller: PeriodQuoteSeller,
  mercuriale: string | null,
): void {
  const top = sheet.y;
  const sellerText = [
    `${seller.name} (${seller.legalForm})`,
    ...seller.addressLines,
    `SIREN ${seller.siren}`,
    ...(seller.vatNumber === "" ? [] : [`TVA ${seller.vatNumber}`]),
  ].join("\n");
  const labelHeight = sheet.put("Vendeur", LEFT, top, LABEL);
  sheet.put("Payeur", LEFT + COLUMN, top, LABEL);
  const style: TextStyle = { size: 9, width: COLUMN - 2 * MM };
  const left = sheet.put(sellerText, LEFT, top + labelHeight, style);
  const right = sheet.put(quote.payerName, LEFT + COLUMN, top + labelHeight, style);
  sheet.advance(labelHeight + Math.max(left, right) + GAP);
  const terms = [
    `Code service : ${quote.serviceCode === "" ? "aucun" : quote.serviceCode}`,
    mercuriale === null
      ? "Tarif appliqué : aucune mercuriale n'agit chez le payeur à la clôture de la période."
      : `Tarif appliqué : la mercuriale « ${mercuriale} ».`,
  ].join("\n");
  sheet.advance(sheet.put(terms, LEFT, sheet.y, BODY) + GAP);
}

/** La demande de retour, sous les totaux, en évidence. */
export function drawReturnRequest(sheet: InvoiceSheet): void {
  const text =
    "Ce devis chiffre les commandes de la période, aux prix figés à leur passation. " +
    "La facture sera émise à réception de votre numéro d'engagement, pour ce même montant, " +
    "et déposée sur Chorus Pro.";
  const height = sheet.heightOf(RETURN_REQUEST, SECTION) + sheet.heightOf(text, BODY);
  sheet.ensure(height);
  const titleHeight = sheet.put(RETURN_REQUEST, LEFT, sheet.y, SECTION);
  sheet.put(text, LEFT, sheet.y + titleHeight, BODY);
  sheet.advance(height + GAP);
}

/** Les commandes chiffrées : numéro, jour de livraison, bons de livraison. */
export function drawPeriodQuoteOrders(
  sheet: InvoiceSheet,
  orders: readonly InvoiceableOrder[],
): void {
  const lines = orders.map((order) => {
    const delivered = order.receivedOn === null ? "" : ` — livrée le ${day(order.receivedOn)}`;
    const notes =
      order.deliveryNoteNumbers.length === 0 ? "" : ` — BL ${order.deliveryNoteNumbers.join(", ")}`;
    return `${order.orderNumber}${delivered}${notes}`;
  });
  const text = lines.join("\n");
  const height = sheet.heightOf("Commandes chiffrées", SECTION) + sheet.heightOf(text, BODY);
  sheet.ensure(height);
  const titleHeight = sheet.put("Commandes chiffrées", LEFT, sheet.y, SECTION);
  sheet.put(text, LEFT, sheet.y + titleHeight, BODY);
  sheet.advance(height + GAP);
}

/** Le pied de chaque page : la mention, le devis, le vendeur, la page sur le total. */
export function drawPeriodQuoteFooters(
  sheet: InvoiceSheet,
  quote: PeriodQuoteSnapshot,
  seller: PeriodQuoteSeller,
): void {
  const range = sheet.doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    sheet.doc.switchToPage(index);
    sheet.put(
      `${NOT_AN_INVOICE} — ${quote.number} v${String(quote.version)} — ${seller.name} — ` +
        `page ${String(index - range.start + 1)} / ${String(range.count)}`,
      LEFT,
      FOOTER_Y,
      FOOT,
    );
  }
}
