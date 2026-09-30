import { InvalidPurchasePriceError } from "../errors/delivery-purchase-errors.js";

/**
 * Un million d'euros HT, en centimes — la borne du contrat
 * (`PURCHASE_PRICE_MAX_CENTS`), reprise ici. Au-delà, c'est une faute de
 * frappe (des centimes saisis comme des euros ×100), pas un devis de
 * camionnette.
 */
export const PURCHASE_PRICE_MAX_CENTS = 100_000_000;

/**
 * **Un prix d'achat HT indicatif**, en centimes entiers
 * (`plan-bibliotheque-d-achat.md`, B-D3). Jamais de flottant, jamais de TVA
 * calculée : un prix de catalogue n'est pas une facture, et aucun prix ne
 * quitte la bibliothèque. Un prix INCONNU n'est pas ce value object : c'est
 * `null`, jamais zéro — zéro est un prix (un bac offert).
 */
export class PurchasePrice {
  private constructor(readonly centsExclVat: number) {}

  /** @throws {InvalidPurchasePriceError} négatif, non entier ou au-delà de la borne. */
  static ofCents(centsExclVat: number): PurchasePrice {
    if (
      !Number.isInteger(centsExclVat) ||
      centsExclVat < 0 ||
      centsExclVat > PURCHASE_PRICE_MAX_CENTS
    ) {
      throw new InvalidPurchasePriceError(centsExclVat, PURCHASE_PRICE_MAX_CENTS);
    }
    return new PurchasePrice(centsExclVat);
  }
}
