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
import {
  money,
  perUnitSuffix,
  quantityText,
  unitPrice,
} from "../../../orders/domain/services/order-sheet-pdf-format.js";
import {
  PICKUP_DISCOUNT_EXCLUDED_NOTE,
  PRETAX_ONLY_NOTE,
  totalRows,
} from "../../../orders/domain/services/order-sheet-pdf-totals.js";
import {
  articlesHeading,
  type DeliveryNoteArt,
  noteFolios,
  noteFooter,
  noteHeader,
  noteParties,
  noteRemark,
  type PrintableNote,
} from "./delivery-note-pdf-parts.js";
import { undeliveredMention, undeliveredSpace } from "./delivery-note-pdf-undelivered.js";
import type { UndeliveredLine } from "./undelivered-lines.js";

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
 *
 * Depuis le 2026-11-03 (Hugo) : une ligne à zéro — l'article qui ne part pas
 * d'un départ incomplet, gardée à zéro dans les données pour que « livré = Σ
 * des BL » — n'est plus imprimée ; une mention « Non livré : … » la dit sous
 * le tableau. Chaque page reprend l'en-tête et porte « Page n / N ».
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

/** Ce que le tableau sait du papier qui l'entoure : l'en-tête à reprendre à chaque page. */
interface Paper {
  readonly note: PrintableNote;
  readonly art: DeliveryNoteArt;
  /** La place à garder sous le tableau, au-delà de la fin commune. */
  readonly tail: number;
}

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
  put(doc, quantityText(line), LEFT, y - 1.2 * MM, { size: 14, bold: true });
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

/** Une page neuve, l'en-tête du BL en haut : rend l'ordonnée sous son filet. */
function nextPage(doc: Doc, paper: Paper): number {
  doc.addPage();
  return noteHeader(doc, paper.note, paper.art.logo);
}

/**
 * Le tableau, paginé sans séparer une ligne de son filet ni le tableau de sa
 * fin ; chaque page reprend l'en-tête, puis les titres de colonnes.
 */
function table(doc: Doc, paper: Paper, columns: Columns, top: number): number {
  const { note } = paper;
  const tail = TAIL_SPACE + paper.tail;
  let y = tableHead(doc, note, columns, top, true);
  for (let index = 0; index < note.lines.length; index += 1) {
    if (note.lines[index]?.quantity === 0) {
      continue;
    }
    if (y > PAGE_HEIGHT - MARGIN_Y - ROW_SPACE - tail) {
      y = tableHead(doc, note, columns, nextPage(doc, paper), false);
    }
    y = articleRow(doc, note, columns, index, y);
  }
  if (y > PAGE_HEIGHT - MARGIN_Y - tail) {
    y = nextPage(doc, paper);
  }
  return y;
}

/**
 * Ce que le pied occupe sous la zone de réception : son filet, « Ce n'est pas
 * une facture. » et la date (le BL de transport n'a pas d'autre mention).
 */
const FOOTER_BLOCK = 15 * MM;

/**
 * **La zone de réception, au bas de la page** (Hugo, 2026-11-03 : « toujours
 * au bas d'une page, pas collé aux rows ») — juste au-dessus du pied, là où
 * l'on signe une feuille qu'on tient. La table a réservé sa place
 * (`TAIL_SPACE`) : elle tient toujours sur la dernière page ; si un contenu
 * plus long la repousse, elle suit simplement ce contenu.
 */
function receiptAtBottom(doc: Doc, top: number): number {
  const anchored = PAGE_HEIGHT - MARGIN_Y - FOOTER_BLOCK - RECEIPT_HEIGHT - 6 * MM;
  return receipt(doc, Math.max(top, anchored));
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
  undelivered: readonly UndeliveredLine[] = [],
): Promise<Buffer> {
  return render(
    new Date(note.issuedAt),
    `Bon de livraison ${note.number}`,
    (doc) => {
      drawCarrierNote(doc, note, art, undelivered);
      noteFolios(doc, note);
    },
    true,
  );
}

/**
 * Le BL de transport, dessiné **sur la page courante d'un document qu'un
 * autre tient** — le dossier du jour du fournil le joint à chaque bon de
 * commande (Hugo, 2026-10-25). Le même dessin que `renderCarrierNotePdf`, au
 * point près : il tourne ses propres pages quand le tableau déborde. Sans
 * folio : la numérotation appartient au document qui le tient.
 */
export function drawCarrierNote(
  doc: Doc,
  note: CarrierNote,
  art: DeliveryNoteArt,
  undelivered: readonly UndeliveredLine[] = [],
): void {
  const columns: Columns = { skuRight: RIGHT, heads: () => undefined, row: () => undefined };
  const paper: Paper = { note, art, tail: undeliveredSpace(doc, undelivered) };
  const top = noteParties(doc, note, noteHeader(doc, note, art.logo));
  const end = undeliveredMention(doc, undelivered, table(doc, paper, columns, top));
  noteFooter(doc, note, receiptAtBottom(doc, noteRemark(doc, note, end)), []);
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
          ? money(line.unitPriceTtcCents) + perUnitSuffix(line)
          : unitPrice(line.unitPriceMillicents) + perUnitSuffix(line);
      const total =
        ttc && line.lineTotalTtcCents !== null ? line.lineTotalTtcCents : line.lineTotalCents;
      putRight(doc, unit, X_UNIT_RIGHT, y, 10.5);
      putRight(doc, money(total), RIGHT, y, 10.5, true);
    },
  };
}

/** La colonne des montants du pavé de totaux, que le libellé ne mord pas. */
const TOTAL_VALUE_WIDTH = 26 * MM;

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
    // Le libellé se replie avant la colonne des montants : la remise de retrait
    // se nomme (point, règle, assiette) et dépasse la largeur d'une ligne.
    put(doc, row.label, blockLeft, y, {
      size: 10.5,
      bold: row.strong === true,
      width: RIGHT - blockLeft - TOTAL_VALUE_WIDTH,
    });
    const labelBottom = doc.y;
    putRight(doc, row.value, RIGHT, y, 11, row.strong === true);
    y = Math.max(y + 5 * MM, labelBottom + 0.5 * MM);
  }
  if (note.variant === "pro" && note.money.settlement === "account") {
    put(doc, PRETAX_ONLY_NOTE, blockLeft, y, { size: 9 });
    y += 5 * MM;
  }
  return y;
}

/** Le BL chiffré, pro ou public. */
export async function renderClientNotePdf(
  note: ClientNote,
  art: DeliveryNoteArt,
  undelivered: readonly UndeliveredLine[] = [],
): Promise<Buffer> {
  const excluded = note.lines.some((line) => line.pickupDiscountEligible === false);
  return render(
    new Date(note.issuedAt),
    `Bon de livraison ${note.number}`,
    (doc) => {
      const paper: Paper = { note, art, tail: undeliveredSpace(doc, undelivered) };
      const top = noteParties(doc, note, noteHeader(doc, note, art.logo));
      const end = undeliveredMention(doc, undelivered, table(doc, paper, pricedColumns(note), top));
      noteFooter(
        doc,
        note,
        noteRemark(doc, note, totals(doc, note, end)),
        excluded ? [PICKUP_DISCOUNT_EXCLUDED_NOTE] : [],
      );
      noteFolios(doc, note);
    },
    true,
  );
}

/** Le nom proposé au téléchargement. */
export function deliveryNotePdfFileName(note: PrintableNote): string {
  return `bon-de-livraison-${note.number}${note.audience === "carrier" ? "-transport" : ""}.pdf`;
}
