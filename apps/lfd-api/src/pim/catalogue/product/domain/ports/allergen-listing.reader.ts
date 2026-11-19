import type { LocalizedText } from "../../../shared/domain/value-objects/localized-text.js";
import type { ProductStatus } from "../entities/product.js";
import type { VariantSnapshot } from "../entities/variant.js";

/** Une déclinaison listée : son nom, son rang, son arrêt et ses allergènes résolus. */
export type AllergenListedVariant = Pick<
  VariantSnapshot,
  "id" | "sku" | "name" | "position" | "isDiscontinued" | "allergenSheet"
>;

/** Une fiche listée en type ALLÉGÉ : ni nutrition, ni TVA de contexte. */
export interface AllergenListedProduct {
  readonly id: string;
  readonly name: LocalizedText;
  readonly status: ProductStatus;
  readonly categoryId: string;
  readonly variants: readonly AllergenListedVariant[];
}

/**
 * **Les fiches vivantes et les allergènes de leurs déclinaisons** — ce que la
 * matrice des allergènes lit de la fiche.
 *
 * Une déclinaison alignée sur le défaut sort avec la déclaration du défaut
 * (`alignedAllergenSheet`, la règle de `Product.snapshot`), jamais `null` :
 * sans quoi elle se lirait « non renseigné ». La résolution est ici parce
 * que la règle est celle de la fiche.
 */
export abstract class AllergenListingReader {
  /** Les fiches hors archive et hors suppression, par SKU, déclinaisons par rang. */
  abstract liveProducts(): Promise<readonly AllergenListedProduct[]>;
}
