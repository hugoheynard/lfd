import { AllergenCatalogueReader } from "../../../allergens/domain/ports/allergen-catalogue.reader.js";
import type { Product } from "../domain/entities/product.js";
import { PropagationIngredientNotFoundError } from "../domain/errors/propagation-errors.js";
import type { CitedIngredient } from "../domain/ports/ingredient-citations.reader.js";
import { IngredientCitationsReader } from "../domain/ports/ingredient-citations.reader.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import {
  effectiveChange,
  ownDeclarations,
  variantPropagation,
  type ProductPropagation,
  type PropagationChange,
} from "../domain/services/ingredient-allergen-propagation.js";

/** Une fiche, son agrégat, et ce que la propagation lui ferait. */
export interface PlannedProduct {
  readonly product: Product;
  readonly propagation: ProductPropagation;
}

export interface PropagationPlan {
  readonly ingredient: CitedIngredient;
  readonly change: PropagationChange;
  readonly products: readonly PlannedProduct[];
}

/**
 * **Le plan de propagation**, partagé par l'aperçu et l'application — qui le
 * RECALCULE au moment d'écrire, pour n'appliquer que ce qu'il propose encore.
 *
 * Les fiches archivées sont écartées ; une fiche citée que le catalogue ne
 * trouve pas (lecture concurrente) aussi : il n'y a rien à lui proposer.
 *
 * @throws {PropagationIngredientNotFoundError} aucun ingrédient sous cette clé.
 */
export async function loadPropagationPlan(
  citations: IngredientCitationsReader,
  products: ProductRepository,
  reference: AllergenCatalogueReader,
  ingredientKey: string,
  requested: PropagationChange,
): Promise<PropagationPlan> {
  const cited = await citations.citationsOf(ingredientKey);
  if (cited === null) {
    throw new PropagationIngredientNotFoundError(ingredientKey);
  }
  const change = effectiveChange(requested, cited.ingredient.allergens);
  const archived = await archivedCodes(reference);
  const loaded = await Promise.all(
    cited.products.map(async (citing) => ({
      citing,
      product: await products.findById(citing.productId),
    })),
  );
  const planned = loaded.flatMap(({ citing, product }) =>
    product === null || product.status === "archived"
      ? []
      : [{ product, propagation: planOf(product, change, citing.otherCited, archived) }],
  );
  return { ingredient: cited.ingredient, change, products: planned };
}

function planOf(
  product: Product,
  change: PropagationChange,
  otherCited: readonly string[],
  archived: ReadonlySet<string>,
): ProductPropagation {
  const snapshot = product.snapshot();
  return {
    productId: product.id,
    name: snapshot.name.fr,
    status: snapshot.status === "published" ? "published" : "draft",
    variants: ownDeclarations(product.resolvedVariants()).map((variant) =>
      variantPropagation(variant, change, otherCited, archived),
    ),
  };
}

/** Les codes archivés — la même lecture que la garde de `validatedAllergens`. */
async function archivedCodes(reference: AllergenCatalogueReader): Promise<ReadonlySet<string>> {
  const catalogue = await reference.catalogue();
  return new Set(
    catalogue.flatMap((category) =>
      category.entries.filter((entry) => entry.archivedAt !== null).map((entry) => entry.code),
    ),
  );
}
