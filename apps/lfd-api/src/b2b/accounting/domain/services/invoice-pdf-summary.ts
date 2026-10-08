import type { InvoiceVatCategory, InvoiceVatPart } from "@lfd/money";

import type { InvoiceState } from "../entities/invoice.types.js";
import {
  latePenaltiesText,
  operationText,
  ordersText,
  recoveryIndemnityText,
} from "./facturx-mentions.js";
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
import { euros, vatRateLabel } from "./invoice-pdf-wording.js";

/**
 * **Le bas de la facture** (E3b) : la ventilation par taux, les totaux, le
 * règlement, les mentions de paiement d'E0 et les bons couverts, puis le pied
 * de chaque page. Les phrases des mentions sont CELLES du XML
 * (`facturx-mentions.ts`) : le papier et la donnée ne peuvent pas diverger.
 */

const BODY: TextStyle = { size: 9, width: CONTENT_WIDTH };
const HEAD: TextStyle = { size: 8, bold: true, color: MUTED };
const SECTION: TextStyle = { size: 9, bold: true };
const FOOT: TextStyle = { size: 7, color: MUTED, width: CONTENT_WIDTH, align: "center" };
const GAP = 4 * MM;

const sum = (parts: readonly InvoiceVatPart[]): number =>
  parts.reduce((total, part) => total + part.amountCents, 0);

const VAT_COLUMNS: readonly (readonly [string, (category: InvoiceVatCategory) => string])[] = [
  ["Taux", (category) => vatRateLabel(category.rate)],
  ["Marchandises HT", (category) => euros(category.goodsHtCents)],
  ["Remises", (category) => euros(sum(category.allowances))],
  ["Frais", (category) => euros(sum(category.charges))],
  ["Base HT", (category) => euros(category.taxableBaseCents)],
  ["TVA", (category) => euros(category.vatCents)],
];
const VAT_WIDTH = CONTENT_WIDTH / VAT_COLUMNS.length;

/** La ventilation de la TVA, un rang par taux (BG-23). */
export function drawVatBreakdown(sheet: InvoiceSheet, state: InvoiceState): void {
  const row = sheet.heightOf("0", { size: 9 }) + 1.5 * MM;
  sheet.ensure(row * (state.vat.categories.length + 2));
  const top = sheet.y;
  VAT_COLUMNS.forEach(([title], index) => {
    sheet.put(title, LEFT + index * VAT_WIDTH, top, { ...HEAD, width: VAT_WIDTH, align: "right" });
  });
  sheet.rule(top + row - 1);
  state.vat.categories.forEach((category, rank) => {
    VAT_COLUMNS.forEach(([, cell], index) => {
      sheet.put(cell(category), LEFT + index * VAT_WIDTH, top + row * (rank + 1), {
        size: 9,
        width: VAT_WIDTH,
        align: "right",
      });
    });
  });
  sheet.advance(row * (state.vat.categories.length + 1) + GAP);
}

/** Total HT, TVA et TTC, à droite — le TTC en gras. */
export function drawTotals(sheet: InvoiceSheet, state: InvoiceState): void {
  const ttc = state.correctedInvoiceId === null ? "Total TTC" : "Total TTC de l'avoir";
  const rows: readonly (readonly [string, string, boolean])[] = [
    ["Total HT", euros(state.vat.taxableBaseCents), false],
    ["Total TVA", euros(state.vat.vatCents), false],
    [ttc, euros(state.vat.totalCents), true],
  ];
  const width = 45 * MM;
  const line = sheet.heightOf("0", { size: 11 }) + 1 * MM;
  sheet.ensure(line * rows.length + GAP);
  rows.forEach(([label, amount, strong], index) => {
    const y = sheet.y + index * line;
    const style: TextStyle = { size: strong ? 11 : 9, bold: strong, width, align: "right" };
    sheet.put(label, RIGHT - 2 * width, y, style);
    sheet.put(amount, RIGHT - width, y, style);
  });
  sheet.advance(line * rows.length + GAP);
}

/** Un paragraphe titré : le titre et ses phrases, qui changent de page ensemble. */
function paragraph(sheet: InvoiceSheet, title: string, sentences: readonly string[]): void {
  const text = sentences.join(" ");
  const height = sheet.heightOf(title, SECTION) + sheet.heightOf(text, BODY);
  sheet.ensure(height);
  const titleHeight = sheet.put(title, LEFT, sheet.y, SECTION);
  sheet.put(text, LEFT, sheet.y + titleHeight, BODY);
  sheet.advance(height + 2 * MM);
}

/**
 * Le règlement (BG-16 figé : prélèvement, RUM, ICS ; sinon l'échéance seule),
 * les mentions de retard, la catégorie d'opération, les bons couverts.
 */
export function drawMentions(sheet: InvoiceSheet, state: InvoiceState): void {
  if (state.paymentMeans !== null) {
    paragraph(sheet, "Règlement", [
      `Prélèvement SEPA à l'échéance — mandat (RUM) ${state.paymentMeans.mandateReference}, ` +
        `créancier (ICS) ${state.seller.ics}.`,
    ]);
  }
  paragraph(sheet, "Conditions de paiement", [
    latePenaltiesText(state),
    recoveryIndemnityText(state),
    state.mentions.earlyPaymentDiscount,
    operationText(state),
  ]);
  if (state.orders.length > 0) {
    paragraph(sheet, "Commandes facturées", [ordersText(state.orders)]);
  }
}

/** Le pied de chaque page : la pièce, le vendeur, la page sur le total. */
export function drawFooters(sheet: InvoiceSheet, state: InvoiceState): void {
  const range = sheet.doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    sheet.doc.switchToPage(index);
    sheet.put(
      `${state.number} — ${state.seller.name} — SIREN ${state.seller.siren} — ` +
        `page ${String(index - range.start + 1)} / ${String(range.count)}`,
      LEFT,
      FOOTER_Y,
      FOOT,
    );
  }
}
