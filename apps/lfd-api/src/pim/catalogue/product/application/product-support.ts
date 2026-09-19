import type { LocalizedText } from "../../shared/domain/value-objects/localized-text.js";
import { ProductNotFoundError, VariantNotFoundError } from "../domain/errors/product-errors.js";
import type { Product } from "../domain/entities/product.js";
import { ProductRepository } from "../domain/ports/product.repository.js";

/**
 * Une déclinaison citée au journal, avec son nom français **du moment** (D5 du
 * plan des phrases du journal).
 *
 * L'appartenance est déjà tenue par l'agrégat au moment où l'on nomme ; une
 * déclinaison absente ici serait donc un défaut du handler, et il se dit.
 *
 * @throws {VariantNotFoundError} la déclinaison n'est pas sous cette fiche.
 */
export function namedVariant(
  product: {
    readonly id: string;
    readonly variants: readonly { readonly id: string; readonly name: LocalizedText }[];
  },
  variantId: string,
): { readonly id: string; readonly name: string } {
  const variant = product.variants.find((candidate) => candidate.id === variantId);
  if (variant === undefined) {
    throw new VariantNotFoundError(product.id, variantId);
  }
  return { id: variant.id, name: variant.name.fr };
}

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
