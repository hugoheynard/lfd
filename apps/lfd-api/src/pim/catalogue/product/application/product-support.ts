import { ProductNotFoundError, VariantNotFoundError } from "../domain/errors/product-errors.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { slugify, type LocalizedText } from "../../shared/domain/value-objects/localized-text.js";

/**
 * Gardes et helpers **partagés** par les handlers produit — la seule chose qui ne
 * tient pas « dans un cas » car plusieurs cas s'en servent. Aucune règle métier propre :
 * juste les invariants d'existence.
 */
export function slugOf(name: LocalizedText): LocalizedText {
  return name.en === undefined
    ? { fr: slugify(name.fr) }
    : { fr: slugify(name.fr), en: slugify(name.en) };
}

export async function requireProduct(products: ProductRepository, id: string): Promise<void> {
  if ((await products.findById(id)) === null) {
    throw new ProductNotFoundError(id);
  }
}

/**
 * Garantit que la déclinaison appartient bien au produit visé — sinon une requête
 * forgée pourrait tarifer/déclarer la variante d'un autre produit.
 */
export async function requireVariant(
  products: ProductRepository,
  productId: string,
  variantId: string,
): Promise<void> {
  const product = await products.findById(productId);
  if (product === null) {
    throw new ProductNotFoundError(productId);
  }
  if (!product.variants.some((variant) => variant.id === variantId)) {
    throw new VariantNotFoundError(productId, variantId);
  }
}
