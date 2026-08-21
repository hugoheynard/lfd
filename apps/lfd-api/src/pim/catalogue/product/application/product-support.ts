import { ProductNotFoundError } from "../domain/errors/product-errors.js";
import type { Product } from "../domain/entities/product.js";
import { ProductRepository } from "../domain/ports/product.repository.js";

/**
 * La seule garde vraiment partagée : charger un produit ou refuser.
 *
 * `requireVariant` a disparu : l'appartenance d'une déclinaison à son produit
 * n'était pas un invariant d'existence mais un invariant de l'agrégat, et
 * c'est `Product.priceVariant` qui la tient désormais. `slugOf` aussi — le
 * slug est dérivé par l'agrégat, plus par l'appelant.
 */
export async function requireProduct(products: ProductRepository, id: string): Promise<Product> {
  const product = await products.findById(id);
  if (product === null) {
    throw new ProductNotFoundError(id);
  }
  return product;
}
