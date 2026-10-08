import type { Buffer } from "node:buffer";

import type { InvoiceState } from "../entities/invoice.types.js";
import {
  CONTENT_WIDTH,
  type InvoiceSheet,
  LEFT,
  MM,
  MUTED,
  RIGHT,
  type TextStyle,
} from "./invoice-pdf-sheet.js";
import { day, documentTitle, euros } from "./invoice-pdf-wording.js";

/**
 * **L'en-tête de la facture** (E3b) : le vendeur et son logo à gauche, la
 * pièce à droite (titre, numéro, dates), puis l'acheteur et l'adresse de
 * livraison. Tout est lu sur la pièce figée : rien ne vient de l'entité du
 * jour.
 */

const LOGO_SIZE = 22 * MM;
const COLUMN = CONTENT_WIDTH / 2 - 4 * MM;
const RIGHT_COLUMN_X = RIGHT - COLUMN;
const BODY: TextStyle = { size: 9, width: COLUMN };
const STRONG: TextStyle = { size: 11, bold: true, width: COLUMN };
const LABEL: TextStyle = { size: 8, bold: true, color: MUTED, width: COLUMN };

/** Pose des lignes l'une sous l'autre ; rend la hauteur totale. */
function stack(
  sheet: InvoiceSheet,
  lines: readonly string[],
  x: number,
  y: number,
  style: TextStyle,
): number {
  let height = 0;
  for (const line of lines) {
    height += sheet.put(line, x, y + height, style);
  }
  return height;
}

/** Les mentions du vendeur que le Code de commerce exige sur la pièce. */
function sellerLines(state: InvoiceState): readonly string[] {
  const { seller } = state;
  return [
    `${seller.legalForm} au capital de ${euros(seller.shareCapitalCents)}`,
    ...seller.addressLines,
    seller.rcs.trim() === ""
      ? `SIREN ${seller.siren}`
      : `SIREN ${seller.siren} — RCS ${seller.rcs.trim()}`,
    ...(seller.vatNumber === "" ? [] : [`TVA intracommunautaire ${seller.vatNumber}`]),
  ];
}

/** Le bloc de la pièce, aligné à droite : ce qu'un service comptable cherche d'abord. */
function pieceLines(state: InvoiceState): readonly string[] {
  return [
    `N° ${state.number}`,
    `Date d'émission : ${day(state.issuedOn)}`,
    ...(state.dueOn === null ? [] : [`Date d'échéance : ${day(state.dueOn)}`]),
    ...(state.correctedInvoiceNumber === null
      ? []
      : [`Avoir sur la facture ${state.correctedInvoiceNumber}`]),
  ];
}

/** Le vendeur (sous son logo s'il existe) et la pièce, côte à côte. */
export function drawHeader(sheet: InvoiceSheet, state: InvoiceState, logo: Buffer | null): void {
  const top = sheet.y;
  let sellerY = top;
  if (logo !== null) {
    sheet.doc.image(logo, LEFT, top, { fit: [LOGO_SIZE, LOGO_SIZE] });
    sellerY += LOGO_SIZE + 3 * MM;
  }
  sellerY += sheet.put(state.seller.name, LEFT, sellerY, STRONG);
  sellerY += stack(sheet, sellerLines(state), LEFT, sellerY, BODY);
  const titleStyle: TextStyle = { size: 20, bold: true, width: COLUMN, align: "right" };
  let pieceY = top + sheet.put(documentTitle(state), RIGHT_COLUMN_X, top, titleStyle);
  pieceY += stack(sheet, pieceLines(state), RIGHT_COLUMN_X, pieceY, { ...BODY, align: "right" });
  sheet.advance(Math.max(sellerY, pieceY) - top + 6 * MM);
}

/** L'acheteur (le payeur légal, Q3) et, si elle diffère, l'adresse de livraison. */
export function drawParties(sheet: InvoiceSheet, state: InvoiceState): void {
  const { buyer } = state;
  const buyerLines = [
    buyer.legalForm,
    ...buyer.billingAddressLines,
    `SIREN ${buyer.siren}`,
    ...(buyer.vatNumber === "" ? [] : [`TVA intracommunautaire ${buyer.vatNumber}`]),
  ].filter((line) => line !== "");
  const delivery = state.deliveryAddressLines ?? [];
  const height =
    sheet.heightOf("Facturé à", LABEL) +
    sheet.heightOf(buyer.name, STRONG) +
    buyerLines.reduce((total, line) => total + sheet.heightOf(line, BODY), 0);
  sheet.ensure(height);
  const top = sheet.y;
  const labelHeight = sheet.put("Facturé à", RIGHT_COLUMN_X, top, LABEL);
  const nameHeight = sheet.put(buyer.name, RIGHT_COLUMN_X, top + labelHeight, STRONG);
  stack(sheet, buyerLines, RIGHT_COLUMN_X, top + labelHeight + nameHeight, BODY);
  if (delivery.length > 0) {
    const deliveryLabel = sheet.put("Livré à", LEFT, top, LABEL);
    stack(sheet, delivery, LEFT, top + deliveryLabel, BODY);
  }
  sheet.advance(height + 6 * MM);
}
