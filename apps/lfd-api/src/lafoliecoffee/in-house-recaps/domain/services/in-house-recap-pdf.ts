import type { Buffer } from "node:buffer";

import { instantToLocal } from "@lfd/contracts";

import {
  BOLD,
  type Doc,
  drawPageFolios,
  LEFT,
  longDate,
  MARGIN_Y,
  MM,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  put,
  putCaps,
  putRight,
  render,
  RIGHT,
  ROW_GRAY,
  rule,
} from "../../../../platform/pdf/paper-pdf-kit.js";
import { saleQuantityText } from "../../../orders/domain/services/order-sheet-pdf-format.js";
import type { RecapLine } from "./recap-aggregation.js";

/** La mention d'en-tête : ce papier n'appelle aucun paiement. */
export const IN_HOUSE_RECAP_MENTION = "Document interne — sans facturation";

/** Un BL couvert, tel que le papier le liste. */
export interface PrintedRecapNote {
  readonly number: string;
  readonly handedOverAt: Date;
}

/** Ce que le rendu reçoit : le récapitulatif figé, son payeur, et ce qu'il remplace. */
export interface InHouseRecapPdfInput {
  readonly number: string;
  readonly payerName: string;
  /** Le mois civil de Paris, `AAAA-MM`. */
  readonly month: string;
  readonly issuedAt: Date;
  /** Le numéro du récapitulatif que celui-ci rectifie ; `null` pour une première émission. */
  readonly replacesNumber: string | null;
  readonly lines: readonly RecapLine[];
  readonly notes: readonly PrintedRecapNote[];
  /** Le filigrane de la planche des documents ; jamais sur un vrai récapitulatif. */
  readonly watermark?: string | undefined;
}

const COL_UNIT_RIGHT = RIGHT - 30 * MM;
const COL_SKU_RIGHT = COL_UNIT_RIGHT - 28 * MM;
const ROW_HEIGHT = 7 * MM;
const BOTTOM = PAGE_HEIGHT - MARGIN_Y - 8 * MM;
const TOP = MARGIN_Y;

/**
 * **Le PDF du récapitulatif des BL** d'un restaurant maison
 * (`plan-restaurants-maison.md`, D7, D10) : en-tête (payeur, mois, numéro,
 * « Document interne — sans facturation »), un tableau produit / unité /
 * quantité totale, puis les BL couverts. **Aucun montant** : l'entrée n'en
 * porte pas. Un rectificatif dit le numéro qu'il remplace.
 *
 * Pur et déterministe : la date du document est l'instant d'émission.
 */
export function renderInHouseRecapPdf(input: InHouseRecapPdfInput): Promise<Buffer> {
  return render(
    input.issuedAt,
    `Récapitulatif des BL ${input.number}`,
    (doc) => {
      const pager = new RecapPager(doc);
      drawHeader(pager, input);
      drawLines(pager, input.lines);
      drawNotes(pager, input.notes);
      drawPageFolios(doc, `${input.number} · ${IN_HOUSE_RECAP_MENTION}`);
      if (input.watermark !== undefined) {
        drawWatermark(doc, input.watermark);
      }
    },
    true,
  );
}

/** « novembre 2026 ». */
export function recapMonthLabel(month: string): string {
  return longDate(`${month}-01`).replace(/^1 /u, "");
}

/** Le nom du fichier remis : `RBL-202611-0001.pdf`. */
export function inHouseRecapFileName(number: string): string {
  return `${number}.pdf`;
}

/**
 * La clé de rangement : le payeur et le numéro. Un numéro n'est émis qu'une
 * fois : la clé n'est jamais réécrite.
 */
export function inHouseRecapDocumentKey(recap: {
  readonly payerId: string;
  readonly number: string;
}): string {
  return `in-house-recaps/${recap.payerId}/${inHouseRecapFileName(recap.number)}`;
}

/** Le curseur vertical, et la page tournée quand la suivante ne tient plus. */
class RecapPager {
  y = TOP;

  constructor(readonly doc: Doc) {}

  /** Tourne la page si `height` ne tient pas ; rend vrai si elle a tourné. */
  room(height: number): boolean {
    if (this.y + height <= BOTTOM) {
      return false;
    }
    this.doc.addPage();
    this.y = TOP;
    return true;
  }
}

function drawHeader(pager: RecapPager, input: InHouseRecapPdfInput): void {
  const { doc } = pager;
  put(doc, "Récapitulatif des BL", LEFT, pager.y, { size: 20, bold: true });
  putRight(doc, input.number, RIGHT, pager.y + 2 * MM, 12, true);
  pager.y += 10 * MM;
  put(doc, input.payerName, LEFT, pager.y, { size: 13, bold: true });
  putRight(doc, recapMonthLabel(input.month), RIGHT, pager.y, 12);
  pager.y += 7 * MM;
  putCaps(doc, IN_HOUSE_RECAP_MENTION.toUpperCase(), LEFT, pager.y);
  putRight(doc, `Émis le ${longDate(instantToLocal(input.issuedAt).day)}`, RIGHT, pager.y, 9);
  pager.y += 6 * MM;
  if (input.replacesNumber !== null) {
    put(doc, `Rectificatif : remplace le récapitulatif ${input.replacesNumber}.`, LEFT, pager.y, {
      size: 10,
      bold: true,
    });
    pager.y += 6 * MM;
  }
  rule(doc, pager.y, 1);
  pager.y += 4 * MM;
}

function linesHead(pager: RecapPager): void {
  const { doc } = pager;
  putCaps(doc, "Produit", LEFT, pager.y);
  putRight(doc, "SKU", COL_SKU_RIGHT, pager.y, 9);
  putRight(doc, "Unité", COL_UNIT_RIGHT, pager.y, 9);
  putRight(doc, "Quantité totale", RIGHT, pager.y, 9);
  pager.y += 5 * MM;
  rule(doc, pager.y, 0.8);
  pager.y += 2 * MM;
}

function drawLines(pager: RecapPager, lines: readonly RecapLine[]): void {
  put(pager.doc, `Produits remis — ${String(lines.length)}`, LEFT, pager.y, {
    size: 12,
    bold: true,
  });
  pager.y += 7 * MM;
  linesHead(pager);
  for (const line of lines) {
    if (pager.room(ROW_HEIGHT)) {
      linesHead(pager);
    }
    const { doc } = pager;
    put(doc, line.productName, LEFT, pager.y, {
      size: 10.5,
      width: COL_SKU_RIGHT - 30 * MM - LEFT,
    });
    putRight(doc, line.sku, COL_SKU_RIGHT, pager.y + 0.5 * MM, 8.5);
    putRight(doc, line.saleUnit === "weight" ? "au poids" : "pièce", COL_UNIT_RIGHT, pager.y, 10);
    putRight(doc, quantityOf(line), RIGHT, pager.y - 0.5 * MM, 12, true);
    pager.y += ROW_HEIGHT - 2 * MM;
    rule(doc, pager.y, 0.5, ROW_GRAY);
    pager.y += 2 * MM;
  }
  pager.y += 6 * MM;
}

function quantityOf(line: RecapLine): string {
  return saleQuantityText(line.quantity, line.saleUnit === "weight" ? "weight" : "piece");
}

function drawNotes(pager: RecapPager, notes: readonly PrintedRecapNote[]): void {
  pager.room(20 * MM);
  put(pager.doc, `BL couverts — ${String(notes.length)}`, LEFT, pager.y, { size: 12, bold: true });
  pager.y += 7 * MM;
  for (const note of notes) {
    pager.room(ROW_HEIGHT);
    put(pager.doc, note.number, LEFT, pager.y, { size: 10 });
    putRight(
      pager.doc,
      `remis le ${longDate(instantToLocal(note.handedOverAt).day)}`,
      RIGHT,
      pager.y,
      10,
    );
    pager.y += ROW_HEIGHT - 1.5 * MM;
  }
}

const WATERMARK = { angle: -35, size: 90, color: "#d9d9d9", opacity: 0.5 } as const;

/** Le mot posé en travers de chaque page de l'exemple. */
function drawWatermark(doc: Doc, text: string): void {
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    doc
      .save()
      .rotate(WATERMARK.angle, { origin: [PAGE_WIDTH / 2, PAGE_HEIGHT / 2] })
      .font(BOLD)
      .fontSize(WATERMARK.size)
      .fillColor(WATERMARK.color)
      .opacity(WATERMARK.opacity)
      .text(text, LEFT + 20 * MM, PAGE_HEIGHT / 2 - 15 * MM, { lineBreak: false })
      .restore();
  }
}
