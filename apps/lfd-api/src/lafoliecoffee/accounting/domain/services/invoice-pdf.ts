import type { Buffer } from "node:buffer";

import type { Invoice } from "../entities/invoice.js";
import type { InvoiceState } from "../entities/invoice.types.js";
import type { InvoicePdfFonts } from "../ports/invoice-font-source.js";
import { BOLD, type InvoiceDoc, renderFacturXPdf } from "./facturx-pdf-document.js";
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
  /**
   * Un filigrane en travers de chaque page, ou rien. Seule la planche des
   * documents en pose un (« EXEMPLE ») : une facture d'exemple porte un numéro
   * plausible, et un PDF qui sortirait de l'écran pourrait passer pour vrai
   * (Hugo, 2026-10-20). Une vraie pièce n'en a jamais.
   */
  readonly watermark?: string | undefined;
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
      if (input.watermark !== undefined) {
        drawWatermark(doc, input.watermark);
      }
    },
  );
}

/** La taille du filigrane, en points : il traverse une page A4 en diagonale. */
const WATERMARK_SIZE = 110;
/** Assez pâle pour lire la pièce au travers, assez net pour ne pas l'oublier. */
const WATERMARK_OPACITY = 0.12;
/** Un rouge, pour qu'on ne le prenne pas pour un gris d'impression. */
const WATERMARK_COLOR = "#9a1b1b";

/**
 * Le filigrane, sur CHAQUE page (les pages sont tamponnées : `bufferPages`).
 * L'opacité est admise par PDF/A-3, qui n'interdit plus la transparence.
 */
function drawWatermark(doc: InvoiceDoc, text: string): void {
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    const { width, height } = doc.page;
    doc.save();
    doc.rotate(-45, { origin: [width / 2, height / 2] });
    doc
      .font(BOLD)
      .fontSize(WATERMARK_SIZE)
      .fillColor(WATERMARK_COLOR)
      .fillOpacity(WATERMARK_OPACITY)
      .text(text, 0, height / 2 - WATERMARK_SIZE / 2, {
        width,
        align: "center",
        lineBreak: false,
      });
    doc.restore();
  }
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
