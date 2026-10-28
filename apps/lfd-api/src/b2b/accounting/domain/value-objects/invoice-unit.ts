import type { SaleQuantity, SaleUnit } from "@lfd/money";

import { UnknownInvoiceUnitError } from "../errors/invoice-issuance-errors.js";

/**
 * Les codes d'unité qu'une ligne de facture peut porter — UN/ECE
 * Recommandation 20, le vocabulaire de BT-130 en EN 16931.
 *
 * Deux seulement, et c'est une liste d'ACCEPTATION : `H87` (pièce) — « une
 * boîte de 6 est une pièce » (Q5, Hugo, 2026-10-08) —, `KGM` (kilogramme)
 * pour un article vendu au poids (plan `vente-au-poids.md`, P7). Le
 * prix net s'entend alors par 1 KGM : aucun `BasisQuantity` n'est émis.
 */
export const INVOICE_UNIT_CODES = ["H87", "KGM"] as const;
export type InvoiceUnitCode = (typeof INVOICE_UNIT_CODES)[number];

/** Le mot lu, sur l'écran et sur la facture. */
export const INVOICE_UNIT_LABELS: Readonly<Record<InvoiceUnitCode, string>> = {
  H87: "pièce",
  KGM: "kilogramme",
};

/** L'unité d'un article vendu à la pièce — et celle de toute ligne d'avoir. */
export const PIECE_UNIT: InvoiceUnitCode = "H87";

/**
 * Ce qu'une unité de vente devient sur la facture : son code, et combien de
 * millièmes de ce code vaut UNE unité de la ligne de bon. Une pièce vaut
 * 1 000 millièmes de pièce ; un gramme, un millième de kilogramme.
 */
const INVOICE_UNIT_OF_SALE: Readonly<
  Record<SaleUnit, { readonly code: InvoiceUnitCode; readonly thousandthsPerAmount: number }>
> = {
  piece: { code: PIECE_UNIT, thousandthsPerAmount: 1_000 },
  weight: { code: "KGM", thousandthsPerAmount: 1 },
};

/** Le code de facture d'une unité de vente : `piece` → `H87`, `weight` → `KGM`. */
export function invoiceUnitCodeOf(unit: SaleUnit): InvoiceUnitCode {
  return INVOICE_UNIT_OF_SALE[unit].code;
}

/**
 * Une quantité de bon en millièmes de son unité de facture — LA conversion,
 * faite une fois à l'agrégation : 3 pièces → 3 000, 1 250 g → 1 250.
 */
export function invoiceThousandthsOf(quantity: SaleQuantity): number {
  return quantity.amount * INVOICE_UNIT_OF_SALE[quantity.unit].thousandthsPerAmount;
}

/** L'unité d'une ligne de facture, auto-validée. */
export class InvoiceUnit {
  private constructor(readonly code: InvoiceUnitCode) {}

  /** @throws {UnknownInvoiceUnitError} le code n'est pas dans la liste admise. */
  static of(raw: string): InvoiceUnit {
    const code = INVOICE_UNIT_CODES.find((candidate) => candidate === raw.trim());
    if (code === undefined) {
      throw new UnknownInvoiceUnitError(raw);
    }
    return new InvoiceUnit(code);
  }

  static piece(): InvoiceUnit {
    return new InvoiceUnit(PIECE_UNIT);
  }

  get label(): string {
    return INVOICE_UNIT_LABELS[this.code];
  }
}
