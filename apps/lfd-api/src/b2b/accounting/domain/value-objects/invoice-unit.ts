import { UnknownInvoiceUnitError } from "../errors/invoice-issuance-errors.js";

/**
 * Les codes d'unité qu'une ligne de facture peut porter — UN/ECE
 * Recommandation 20, le vocabulaire de BT-130 en EN 16931.
 *
 * Deux seulement, et c'est une liste d'ACCEPTATION : `H87` (pièce) pour tout
 * ce qui se vend aujourd'hui — « une boîte de 6 est une pièce » (Q5, Hugo,
 * 2026-10-08) —, `KGM` (kilogramme) pour la vente au poids variable annoncée
 * « mais pas tout de suite ». La porter dès maintenant évite qu'une ligne au
 * kilo change la forme d'une facture déjà émise.
 */
export const INVOICE_UNIT_CODES = ["H87", "KGM"] as const;
export type InvoiceUnitCode = (typeof INVOICE_UNIT_CODES)[number];

/** Le mot lu, sur l'écran et sur la facture. */
export const INVOICE_UNIT_LABELS: Readonly<Record<InvoiceUnitCode, string>> = {
  H87: "pièce",
  KGM: "kilogramme",
};

/**
 * L'unité de TOUTES les lignes d'aujourd'hui. Le catalogue vend à l'unité et
 * `order_lines.quantity` est un entier : tant qu'aucun produit ne se vend au
 * poids variable, rien ne peut produire autre chose.
 */
export const PIECE_UNIT: InvoiceUnitCode = "H87";

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
