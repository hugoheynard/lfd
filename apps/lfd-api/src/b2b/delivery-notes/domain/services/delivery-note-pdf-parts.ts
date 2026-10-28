import type { Buffer } from "node:buffer";

import type { CarrierNote, ClientNote } from "@lfd/contracts";

import {
  type Doc,
  LEFT,
  longDate,
  MM,
  put,
  putCaps,
  rule,
  WIDTH,
} from "../../../../platform/pdf/paper-pdf-kit.js";
import { fulfillmentLines, methodLabel } from "../../../orders/domain/services/order-sheet-pdf.js";
import { articlesHeading as linesHeading } from "../../../orders/domain/services/order-sheet-pdf-format.js";
import { paperHeader } from "../../../orders/domain/services/order-sheet-pdf-header.js";

/**
 * **Les morceaux communs aux deux BL imprimés** — transport et client (plan
 * E5a, § 2) : l'en-tête du bon de commande avec ses mots, les deux blocs de
 * tête, la note, le pied. Ce qui diffère — le tableau, le pavé de totaux, la
 * zone de réception — vit dans le rendu de chaque lecteur.
 */

/** Ce que les deux rendus reçoivent à côté du BL — jamais dedans. */
export interface DeliveryNoteArt {
  /** Le logo de l'en-tête, en octets PNG. */
  readonly logo: Buffer;
}

/** Un BL imprimable : celui du transport, ou celui du client. */
export type PrintableNote = CarrierNote | ClientNote;

/** « BON DE LIVRAISON », son numéro, et le rappel de la commande. */
export function noteHeader(doc: Doc, note: PrintableNote, logo: Buffer): number {
  const dateLine = `Commande ${note.orderReference} du ${longDate(note.orderPlacedAt)}`;
  const subLine =
    note.receivedOn !== null
      ? `Remis le ${longDate(note.receivedOn)}`
      : note.requestedFor === null
        ? null
        : `Prévu le ${longDate(note.requestedFor)}`;
  return paperHeader(
    doc,
    { title: "BON DE LIVRAISON", reference: note.number, dateLine, subLine },
    logo,
    null,
  );
}

/** Le nom à imprimer, et la seconde ligne s'il y en a une. */
function customerLines(note: PrintableNote): readonly [string, string | null] {
  if (note.audience === "client" && note.variant === "public") {
    const phone = note.customerPhone === null ? null : `Tél. ${note.customerPhone}`;
    return [note.customer.legalName, phone];
  }
  const legal =
    note.customer.legalName === note.customer.tradeName ? null : note.customer.legalName;
  return [note.customer.tradeName, legal];
}

/** Les deux blocs de tête : à qui, et par quelle voie. */
export function noteParties(doc: Doc, note: PrintableNote, top: number): number {
  const half = LEFT + WIDTH / 2;
  const y = top + 5 * MM;
  putCaps(doc, "CLIENT", LEFT, y);
  putCaps(doc, "ACHEMINEMENT", half, y);
  const body = y + 5 * MM;
  const [name, second] = customerLines(note);
  put(doc, name, LEFT, body, { size: 13, bold: true });
  if (second !== null) {
    put(doc, second, LEFT, body + 5.5 * MM, { size: 10 });
  }
  put(doc, methodLabel(note.fulfillment), half, body, { size: 12, bold: true });
  let right = body + 5.5 * MM;
  for (const line of fulfillmentLines(note.fulfillment)) {
    put(doc, line, half, right, { size: 11 });
    right += 4.4 * MM;
  }
  const bottom = Math.max(right, body + 11 * MM) + 2 * MM;
  rule(doc, bottom, 1);
  return bottom + 1;
}

/**
 * « ARTICLES — 3 lignes, 172 pièces » — la phrase du bon de commande : une
 * ligne au poids se compte à part (« 1 au poids »), jamais par ses grammes
 * (`vente-au-poids.md`, P5). Un BL à la pièce s'annonce comme avant.
 */
export function articlesHeading(note: PrintableNote): string {
  return linesHeading(note.lines);
}

/** La note de la commande, si elle existe. */
export function noteRemark(doc: Doc, note: PrintableNote, top: number): number {
  if (note.note === "") {
    return top;
  }
  const y = top + 3 * MM;
  putCaps(doc, "NOTE", LEFT, y);
  put(doc, note.note, LEFT, y + 4.8 * MM, { size: 11, width: WIDTH });
  return doc.y + 2 * MM;
}

/** La phrase qui empêche un comptable de classer le BL comme une facture. */
export const NOT_AN_INVOICE = "Ce n'est pas une facture.";

/** Le pied : les mentions propres au lecteur, puis « Ce n'est pas une facture. » et la date. */
export function noteFooter(
  doc: Doc,
  note: PrintableNote,
  top: number,
  mentions: readonly string[],
): void {
  let y = top + 4 * MM;
  rule(doc, y, 1);
  y += 3 * MM;
  for (const mention of mentions) {
    put(doc, mention, LEFT, y, { size: 9 });
    y += 4 * MM;
  }
  put(doc, NOT_AN_INVOICE, LEFT, y, { size: 9, bold: true });
  y += 4 * MM;
  put(doc, `Établi le ${longDate(note.issuedAt)}`, LEFT, y, { size: 9 });
}
