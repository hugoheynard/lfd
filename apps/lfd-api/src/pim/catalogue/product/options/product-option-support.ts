import { OptionGroupNotFoundError } from "../../../reference/product-options/domain/errors/option-group-errors.js";
import {
  OptionGroupOffers,
  type OptionGroupOffer,
} from "../../../reference/product-options/domain/ports/option-group-offers.reader.js";
import type { OptionActivationFiche } from "../domain/entities/product-option-activations.js";
import type { Product } from "../domain/entities/product.js";

/** Le groupe visé, lu au référentiel des options, ou le refus. @throws {OptionGroupNotFoundError} */
export async function requireOffer(
  offers: OptionGroupOffers,
  groupId: string,
): Promise<OptionGroupOffer> {
  const [group] = await offers.describe([groupId]);
  if (group === undefined) {
    throw new OptionGroupNotFoundError(groupId);
  }
  return group;
}

/** Ce que l'activation sait de la fiche : son état et ses déclinaisons. */
export function ficheOf(product: Product): OptionActivationFiche {
  const snapshot = product.snapshot();
  return {
    id: snapshot.id,
    status: snapshot.status,
    variantIds: snapshot.variants.map((variant) => variant.id),
  };
}

/** Les noms français des déclinaisons citées, dans l'ordre de la fiche — pour le journal. */
export function variantNamesOf(product: Product, variantIds: readonly string[]): string[] {
  const wanted = new Set(variantIds);
  return product
    .snapshot()
    .variants.filter((variant) => wanted.has(variant.id))
    .map((variant) => variant.name.fr);
}
