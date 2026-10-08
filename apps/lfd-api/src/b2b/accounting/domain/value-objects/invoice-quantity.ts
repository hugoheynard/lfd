import { InvalidInvoiceQuantityError } from "../errors/invoice-errors.js";
import type { InvoiceUnitCode } from "./invoice-unit.js";

/** Trois décimales : le gramme pour un kilogramme, assez pour BT-129. */
export const INVOICE_QUANTITY_SCALE = 3;
const THOUSANDTHS_PER_UNIT = 1_000;

/**
 * **La quantité d'une ligne de facture**, décimale — en millièmes entiers.
 *
 * Toutes les quantités d'aujourd'hui sont entières (Q5 : « une boîte de 6 est
 * une pièce », `order_lines.quantity` est un entier). La forme admet pourtant
 * des décimales dès E1, pour qu'une ligne au kilogramme (`KGM`, vente au
 * poids, « mais pas tout de suite ») ne change pas la forme d'une facture
 * déjà émise. Des millièmes ENTIERS et non un flottant : 1,250 kg = 1250, et
 * aucune somme ne dérive.
 *
 * Une pièce (`H87`) reste entière : une demi-pièce n'est pas une vente, c'est
 * une faute de calcul.
 */
export class InvoiceQuantity {
  private constructor(readonly thousandths: number) {}

  /** Une quantité entière d'unités — tout ce que les bons portent aujourd'hui. */
  static units(count: number, unit: InvoiceUnitCode): InvoiceQuantity {
    if (!Number.isInteger(count)) {
      throw new InvalidInvoiceQuantityError(String(count), "nombre entier d'unités attendu");
    }
    return InvoiceQuantity.ofThousandths(count * THOUSANDTHS_PER_UNIT, unit);
  }

  /**
   * @throws {InvalidInvoiceQuantityError} non entier, nul ou négatif, ou
   *   fractionnaire pour une pièce.
   */
  static ofThousandths(thousandths: number, unit: InvoiceUnitCode): InvoiceQuantity {
    const raw = `${String(thousandths)} millièmes`;
    if (!Number.isSafeInteger(thousandths) || thousandths <= 0) {
      throw new InvalidInvoiceQuantityError(
        raw,
        "quantité strictement positive en millièmes entiers attendue",
      );
    }
    if (unit === "H87" && thousandths % THOUSANDTHS_PER_UNIT !== 0) {
      throw new InvalidInvoiceQuantityError(raw, "une pièce (H87) se compte en entiers");
    }
    return new InvoiceQuantity(thousandths);
  }

  /** La forme imprimée et structurée (BT-129) : `12`, `1.25`, `0.005`. */
  toDecimalString(): string {
    const whole = Math.floor(this.thousandths / THOUSANDTHS_PER_UNIT);
    const fraction = this.thousandths % THOUSANDTHS_PER_UNIT;
    if (fraction === 0) {
      return String(whole);
    }
    const digits = String(fraction).padStart(INVOICE_QUANTITY_SCALE, "0").replace(/0+$/u, "");
    return `${String(whole)}.${digits}`;
  }
}
