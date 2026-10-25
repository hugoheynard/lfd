import type { Buffer } from "node:buffer";

import type { CarrierNote, ClientNote } from "@lfd/contracts";

import {
  type Doc,
  LEFT,
  MARGIN_Y,
  MM,
  PAGE_HEIGHT,
  put,
  putCaps,
  putRight,
  render,
  RIGHT,
  ROW_GRAY,
  rule,
  WIDTH,
} from "../../../../platform/pdf/paper-pdf-kit.js";
import { strokeBox } from "../../../../platform/pdf/paper-pdf-shapes.js";
import { sheetShowsTtc } from "../../../orders/domain/services/order-sheet.js";
import { money, unitPrice } from "../../../orders/domain/services/order-sheet-pdf-format.js";
import {
  PICKUP_DISCOUNT_EXCLUDED_NOTE,
  PRETAX_ONLY_NOTE,
  totalRows,
} from "../../../orders/domain/services/order-sheet-pdf-totals.js";
import {
  articlesHeading,
  type DeliveryNoteArt,
  noteFooter,
  noteHeader,
  noteParties,
  noteRemark,
  type PrintableNote,
} from "./delivery-note-pdf-parts.js";

/**
 * **Le bon de livraison en PDF** (plan
 * plan E5a (`documentation/commandes/bon-de-livraison.md`), § 2) —
 * un rendu par lecteur imprimable, sur le kit papier du bon de commande.
 *
 * - `renderCarrierNotePdf` : le papier qui voyage avec la marchandise.
 *   Articles et quantités, une zone « Reçu par, le, signature », **aucun
 *   montant** — il reçoit un `CarrierNote`, qui n'en porte pas.
 * - `renderClientNotePdf` : le BL chiffré, pro (HT) ou public (TTC), le pavé
 *   de totaux du bon de commande lu sur les totaux recopiés du BL.
 *
 * Déterministes : la date du document est celle du dernier pas du BL.
 */

const COL_QTY = 16 * MM;
const COL_SKU = 26 * MM;
const COL_UNIT = 22 * MM;
const COL_TOTAL = 26 * MM;
const X_NAME = LEFT + COL_QTY;
const X_SKU_RIGHT = RIGHT - COL_UNIT - COL_TOTAL;
const X_UNIT_RIGHT = RIGHT - COL_TOTAL;
const ROW_SPACE = 12 * MM;
const TAIL_SPACE = 70 * MM;
const RECEIPT_HEIGHT = 24 * MM;

/** Les colonnes d'un lecteur : où finit le nom, et qui pose les prix. */
interface Columns {
  readonly skuRight: number | null;
  readonly heads: (doc: Doc, y: number) => void;
  readonly row: (doc: Doc, index: number, y: number) => void;
}

function tableHead(
  doc: Doc,
  note: PrintableNote,
  columns: Columns,
  top: number,
  first: boolean,
): number {
  let y = top + 5 * MM;
  if (first) {
    putCaps(doc, articlesHeading(note), LEFT, y);
    y += 5 * MM;
  }
  putCaps(doc, "Qté", LEFT, y);
  putCaps(doc, "Article", X_NAME, y);
  if (columns.skuRight !== null) {
    putRight(doc, "SKU", columns.skuRight, y, 9);
  }
  columns.heads(doc, y);
  const bottom = y + 4 * MM;
  rule(doc, bottom, 1);
  return bottom + 1;
}

function articleRow(
  doc: Doc,
  note: PrintableNote,
  columns: Columns,
  index: number,
  top: number,
): number {
  const line = note.lines[index];
  const y = top + 4.6 * MM;
  if (line === undefined) {
    return top;
  }
  put(doc, String(line.quantity), LEFT, y - 1.2 * MM, { size: 14, bold: true });
  const nameRight = columns.skuRight === null ? RIGHT - 2 * MM : columns.skuRight - COL_SKU;
  // L'astérisque d'une ligne hors remise de retrait, expliqué au pied.
  const excluded = "pickupDiscountEligible" in line && line.pickupDiscountEligible === false;
  const name = excluded ? `${line.productName} *` : line.productName;
  put(doc, name, X_NAME, y, { size: 11.5, width: nameRight - X_NAME });
  if (columns.skuRight !== null) {
    putRight(doc, line.sku, columns.skuRight, y + 0.8 * MM, 8.5);
  }
  columns.row(doc, index, y);
  const bottom = y + 4.6 * MM;
  rule(doc, bottom, 0.6, ROW_GRAY);
  return bottom + 0.6;
}

/** Le tableau, paginé sans séparer une ligne de son filet ni le tableau de sa fin. */
function table(doc: Doc, note: PrintableNote, columns: Columns, top: number): number {
  let y = tableHead(doc, note, columns, top, true);
  for (let index = 0; index < note.lines.length; index += 1) {
    if (y > PAGE_HEIGHT - MARGIN_Y - ROW_SPACE - TAIL_SPACE) {
      doc.addPage();
      y = tableHead(doc, note, columns, MARGIN_Y - 5 * MM, false);
    }
    y = articleRow(doc, note, columns, index, y);
  }
  if (y > PAGE_HEIGHT - MARGIN_Y - TAIL_SPACE) {
    doc.addPage();
    y = MARGIN_Y;
  }
  return y;
}

/** La zone que remplit la personne qui réceptionne : trois cases, à la main. */
function receipt(doc: Doc, top: number): number {
  const y = top + 6 * MM;
  const third = WIDTH / 3;
  const labels = ["Reçu par", "Le", "Signature"];
  labels.forEach((label, index) => {
    const x = LEFT + index * third;
    strokeBox(doc, { x, y, width: third - 2 * MM, height: RECEIPT_HEIGHT }, 0.8);
    putCaps(doc, label, x + 2 * MM, y + 2 * MM);
  });
  return y + RECEIPT_HEIGHT;
}

/** Le BL de transport. **Aucun montant** : le `CarrierNote` n'en porte pas. */
export async function renderCarrierNotePdf(
  note: CarrierNote,
  art: DeliveryNoteArt,
): Promise<Buffer> {
  return render(new Date(note.issuedAt), `Bon de livraison ${note.number}`, (doc) => {
    drawCarrierNote(doc, note, art);
  });
}

/**
 * Le BL de transport, dessiné **sur la page courante d'un document qu'un
 * autre tient** — le dossier du jour du fournil le joint à chaque bon de
 * commande (Hugo, 2026-10-25). Le même dessin que `renderCarrierNotePdf`, au
 * point près : il tourne ses propres pages quand le tableau déborde.
 */
export function drawCarrierNote(doc: Doc, note: CarrierNote, art: DeliveryNoteArt): void {
  const columns: Columns = { skuRight: RIGHT, heads: () => undefined, row: () => undefined };
  const top = noteParties(doc, note, noteHeader(doc, note, art.logo));
  const end = table(doc, note, columns, top);
  noteFooter(doc, note, noteRemark(doc, note, receipt(doc, end)), []);
}

/** Les colonnes chiffrées : PU et total, TTC quand le BL en porte (bon public). */
function pricedColumns(note: ClientNote): Columns {
  const ttc = sheetShowsTtc(note);
  return {
    skuRight: note.variant === "pro" ? X_SKU_RIGHT : null,
    heads: (doc, y) => {
      putRight(doc, ttc ? "PU TTC" : "PU HT", X_UNIT_RIGHT, y, 9);
      putRight(doc, ttc ? "Total TTC" : "Total HT", RIGHT, y, 9);
    },
    row: (doc, index, y) => {
      const line = note.lines[index];
      if (line === undefined) {
        return;
      }
      const unit =
        ttc && line.unitPriceTtcCents !== null
          ? money(line.unitPriceTtcCents)
          : unitPrice(line.unitPriceMillicents);
      const total =
        ttc && line.lineTotalTtcCents !== null ? line.lineTotalTtcCents : line.lineTotalCents;
      putRight(doc, unit, X_UNIT_RIGHT, y, 10.5);
      putRight(doc, money(total), RIGHT, y, 10.5, true);
    },
  };
}

/** Le pavé de totaux du bon de commande, sur les totaux recopiés du BL. */
function totals(doc: Doc, note: ClientNote, top: number): number {
  const blockLeft = RIGHT - 78 * MM;
  let y = top + 5 * MM;
  for (const row of totalRows(note)) {
    if (row.rule === true) {
      doc
        .save()
        .rect(blockLeft, y, RIGHT - blockLeft, 1)
        .fill()
        .restore();
      y += 2 * MM;
    }
    put(doc, row.label, blockLeft, y, { size: 10.5, bold: row.strong === true });
    putRight(doc, row.value, RIGHT, y, 11, row.strong === true);
    y += 5 * MM;
  }
  if (note.variant === "pro" && note.money.settlement === "account") {
    put(doc, PRETAX_ONLY_NOTE, blockLeft, y, { size: 9 });
    y += 5 * MM;
  }
  return y;
}

/** Le BL chiffré, pro ou public. */
export async function renderClientNotePdf(note: ClientNote, art: DeliveryNoteArt): Promise<Buffer> {
  const excluded = note.lines.some((line) => line.pickupDiscountEligible === false);
  return render(new Date(note.issuedAt), `Bon de livraison ${note.number}`, (doc) => {
    const top = noteParties(doc, note, noteHeader(doc, note, art.logo));
    const end = table(doc, note, pricedColumns(note), top);
    noteFooter(
      doc,
      note,
      noteRemark(doc, note, totals(doc, note, end)),
      excluded ? [PICKUP_DISCOUNT_EXCLUDED_NOTE] : [],
    );
  });
}

/** Le nom proposé au téléchargement. */
export function deliveryNotePdfFileName(note: PrintableNote): string {
  return `bon-de-livraison-${note.number}${note.audience === "carrier" ? "-transport" : ""}.pdf`;
}
