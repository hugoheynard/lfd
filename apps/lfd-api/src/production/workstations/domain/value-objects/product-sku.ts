import { InvalidProductSkuError } from "../errors/workstation-errors.js";

/** La borne des SKU du dépôt dans les corps de requête. */
export const PRODUCT_SKU_MAX_LENGTH = 64;

/**
 * **La référence d'un produit**, telle que le commerce la donne
 * (`productSku`) — opaque pour le fournil, comme le SKU de ses lignes. Toutes
 * les déclinaisons d'un produit la partagent, et c'est à elle qu'un poste
 * s'attache (décision de Hugo, 2026-11-16 : un poste par produit).
 */
export class ProductSku {
  private constructor(readonly value: string) {}

  /** @throws {InvalidProductSkuError} vide ou trop longue. */
  static of(raw: string): ProductSku {
    const value = raw.trim();
    if (value.length === 0 || value.length > PRODUCT_SKU_MAX_LENGTH) {
      throw new InvalidProductSkuError();
    }
    return new ProductSku(value);
  }
}
