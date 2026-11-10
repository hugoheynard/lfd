import type { InvoiceUnitCode } from "../value-objects/invoice-unit.js";

/**
 * **La quantité d'une ligne de facture, telle qu'on l'imprime** — PDF, CSV du
 * dossier (plan `vente-au-poids.md`, § 3 bis, point 6).
 *
 * Une pièce s'imprime entière ; un kilogramme **toujours à trois décimales**
 * (« 1.250 », « 2.000 ») : le gramme se lit sur la pièce comme dans son XML.
 * BT-129, lui, s'écrit sans zéro superflu (`thousandthsQuantity`,
 * `facturx-format.ts`), et ce fichier n'y touche pas.
 *
 * Point décimal : chaque lecteur pose son séparateur.
 */

const THOUSANDTHS_PER_UNIT = 1_000;

/** Les décimales imprimées par unité : 0 pour la pièce, 3 (le gramme) pour le kilo. */
const PRINTED_DECIMALS: Readonly<Record<InvoiceUnitCode, 0 | 3>> = { H87: 0, KGM: 3 };

/** Le symbole court imprimé après la quantité. */
export const PRINTED_UNIT_SYMBOLS: Readonly<Record<InvoiceUnitCode, string>> = {
  H87: "pièce(s)",
  KGM: "kg",
};

/** `(1250, KGM)` → `"1.250"` ; `(2000, KGM)` → `"2.000"` ; `(12000, H87)` → `"12"`. */
export function printedQuantity(quantityThousandths: number, unitCode: InvoiceUnitCode): string {
  const whole = Math.trunc(quantityThousandths / THOUSANDTHS_PER_UNIT);
  const decimals = PRINTED_DECIMALS[unitCode];
  if (decimals === 0) {
    // Une pièce est un entier (`InvoiceQuantity`) : il n'y a rien après la virgule.
    return String(whole);
  }
  const fraction = String(quantityThousandths % THOUSANDTHS_PER_UNIT).padStart(decimals, "0");
  return `${String(whole)}.${fraction}`;
}
