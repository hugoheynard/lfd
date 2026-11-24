import type { Buffer } from "node:buffer";

import { instantToLocal } from "@lfd/contracts";

import type { PeriodQuoteSnapshot } from "../entities/period-quote.js";
import type { InvoicePdfFonts } from "../ports/invoice-font-source.js";
import { renderFacturXPdf } from "./facturx-pdf-document.js";
import { simulateInvoiceDossier } from "./invoice-dossier.js";
import { drawWatermark } from "./invoice-pdf.js";
import { drawLineTable } from "./invoice-pdf-lines.js";
import { InvoiceSheet, LEFT, MUTED } from "./invoice-pdf-sheet.js";
import { drawTotals, drawVatBreakdown } from "./invoice-pdf-summary.js";
import type { InvoiceableOrder } from "./monthly-invoicing.js";
import {
  drawPeriodQuoteFooters,
  drawPeriodQuoteHeader,
  drawPeriodQuoteOrders,
  drawPeriodQuoteParties,
  drawReturnRequest,
  periodQuoteTitle,
} from "./period-quote-pdf-parts.js";

/** Le vendeur tel que le devis l'imprime : l'entité, lue au rendu. */
export interface PeriodQuoteSeller {
  readonly name: string;
  readonly legalForm: string;
  readonly siren: string;
  readonly vatNumber: string;
  readonly addressLines: readonly string[];
}

/** Ce que le rendu reçoit : le devis, ses commandes relues, les parties, les polices. */
export interface PeriodQuotePdfInput {
  readonly quote: PeriodQuoteSnapshot;
  /** Les commandes du devis, annulées retirées — celles dont l'empreinte est celle du devis. */
  readonly orders: readonly InvoiceableOrder[];
  readonly seller: PeriodQuoteSeller;
  /** Le nom de la mercuriale qui agit chez le payeur à la clôture ; `null` : aucune. */
  readonly mercuriale: string | null;
  readonly fonts: InvoicePdfFonts;
  /** Le filigrane de la planche des documents ; jamais sur un vrai devis. */
  readonly watermark?: string | undefined;
}

/**
 * **Le PDF d'un devis de période** (plan `plan-clients-publics-chorus.md`,
 * § 6 sexies, QD4) : un PDF ORDINAIRE, sans XML Factur-X ni déclaration
 * PDF/A — un devis n'est pas une pièce comptable, et un fichier qui
 * porterait une Factur-X se lirait comme une facture.
 *
 * Ses lignes et ses totaux viennent de `simulateInvoiceDossier` sur les
 * commandes du devis : le calcul même de la facture qu'il annonce, celui de
 * son empreinte (v5 B1). Jamais de `draftOf`, qui juge, numérote et date.
 *
 * Pur et déterministe : la date du fichier est le jour (Paris) où cette
 * version a été rangée, une donnée du devis.
 */
export function renderPeriodQuotePdf(input: PeriodQuotePdfInput): Promise<Buffer> {
  const { quote } = input;
  const sorted = [...input.orders].sort((left, right) =>
    left.orderId < right.orderId ? -1 : left.orderId > right.orderId ? 1 : 0,
  );
  const { invoice } = simulateInvoiceDossier(sorted.map((order) => order.frozen));
  return renderFacturXPdf(
    {
      title: periodQuoteTitle(quote),
      issuedOn: instantToLocal(quote.createdAt).day,
      xml: null,
      fonts: input.fonts,
    },
    (doc) => {
      const sheet = new InvoiceSheet(doc, (next) => {
        const height = next.put(`${periodQuoteTitle(quote)} (suite)`, LEFT, next.y, {
          size: 9,
          bold: true,
          color: MUTED,
        });
        next.advance(height * 2);
      });
      drawPeriodQuoteHeader(sheet, quote);
      drawPeriodQuoteParties(sheet, quote, input.seller, input.mercuriale);
      drawLineTable(sheet, invoice.lines);
      drawVatBreakdown(sheet, invoice);
      drawTotals(sheet, { vat: invoice.vat, correctedInvoiceId: null });
      drawReturnRequest(sheet);
      drawPeriodQuoteOrders(sheet, sorted);
      drawPeriodQuoteFooters(sheet, quote, input.seller);
      if (input.watermark !== undefined) {
        drawWatermark(doc, input.watermark);
      }
    },
  );
}

/** Le nom du fichier remis : `D-20261031-1-v2.pdf`. */
export function periodQuoteFileName(
  quote: Pick<PeriodQuoteSnapshot, "number" | "version">,
): string {
  return `${quote.number}-v${String(quote.version)}.pdf`;
}

/**
 * La clé de rangement : l'entité, le numéro, la version — et rien d'autre.
 * Une version ne se rend qu'une fois : la clé n'est jamais réécrite.
 */
export function periodQuoteDocumentKey(
  quote: Pick<PeriodQuoteSnapshot, "legalEntityId" | "number" | "version">,
): string {
  return `quotes/${quote.legalEntityId}/${periodQuoteFileName(quote)}`;
}
