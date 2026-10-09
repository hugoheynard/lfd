import type { Buffer } from "node:buffer";

import type { Invoice } from "../entities/invoice.js";
import type { InvoiceState } from "../entities/invoice.types.js";
import type { InvoicePdfFonts } from "../ports/invoice-font-source.js";
import { renderFacturXPdf } from "./facturx-pdf-document.js";
import { drawHeader, drawParties } from "./invoice-pdf-header.js";
import { drawLines } from "./invoice-pdf-lines.js";
import { InvoiceSheet, LEFT, MUTED } from "./invoice-pdf-sheet.js";
import { drawFooters, drawMentions, drawTotals, drawVatBreakdown } from "./invoice-pdf-summary.js";
import { documentTitle } from "./invoice-pdf-wording.js";

/** Ce que le rendu reçoit : la pièce, son XML déjà contrôlé, les polices, le logo. */
export interface InvoicePdfInput {
  readonly invoice: Invoice;
  /** Le XML CII de `renderFacturXml`, joint tel quel. */
  readonly xml: string;
  readonly fonts: InvoicePdfFonts;
  /** Le logo de l'entité émettrice ; `null` : la pièce sort sans, valide. */
  readonly logo: Buffer | null;
}

/**
 * **Le PDF/A-3b Factur-X d'une facture ou d'un avoir** (plan
 * `facture-emise.md`) : la pièce figée mise en page,
 * le XML EN 16931 joint (`factur-x.xml`, relation `Alternative`). Pur et
 * déterministe : ni horloge, ni réseau, ni disque.
 *
 * Toutes les mentions sont lues sur la pièce : vendeur et acheteur figés,
 * numéro, dates, lignes, ventilation, totaux, échéance, mentions E0, moyen
 * de paiement BG-16, bons couverts. Un avoir dit « AVOIR » et la facture
 * qu'il corrige.
 */
export function renderInvoicePdf(input: InvoicePdfInput): Promise<Buffer> {
  const state = input.invoice.toState();
  const kind = state.correctedInvoiceId === null ? "Facture" : "Avoir";
  return renderFacturXPdf(
    {
      title: `${kind} ${state.number}`,
      issuedOn: state.issuedOn,
      xml: input.xml,
      fonts: input.fonts,
    },
    (doc) => {
      const sheet = new InvoiceSheet(doc, (next) => continuationHeader(next, state));
      drawHeader(sheet, state, input.logo);
      drawParties(sheet, state);
      drawLines(sheet, state);
      drawVatBreakdown(sheet, state);
      drawTotals(sheet, state);
      drawMentions(sheet, state);
      drawFooters(sheet, state);
    },
  );
}

/** En tête d'une page de suite : de quelle pièce elle est. */
function continuationHeader(sheet: InvoiceSheet, state: InvoiceState): void {
  const height = sheet.put(`${documentTitle(state)} ${state.number} (suite)`, LEFT, sheet.y, {
    size: 9,
    bold: true,
    color: MUTED,
  });
  sheet.advance(height * 2);
}
