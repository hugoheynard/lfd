import type { Sku } from "../value-objects/sku.value-object.js";
import type { LocalizedText } from "../value-objects/localized-text.js";

export type ProductKind = "daily" | "made_to_order" | "resale";
export type ProductStatus = "draft" | "published" | "archived";

export interface ProductRecord {
  readonly id: string;
  readonly sku: string;
  readonly name: LocalizedText;
  readonly slug: LocalizedText;
  readonly kind: ProductKind;
  readonly categoryId: string;
  readonly status: ProductStatus;
  readonly variants: readonly VariantRecord[];
}

/** Valeurs nutritionnelles pour 100 g ; chaque champ `null` = non renseigné. */
export interface VariantNutritionView {
  readonly mayContain: readonly string[];
  readonly energyKcal: number | null;
  readonly carbsG: number | null;
  readonly fatG: number | null;
  readonly proteinG: number | null;
  readonly glycemicIndex: number | null;
}

export interface VariantRecord {
  readonly id: string;
  readonly sku: string;
  readonly name: LocalizedText;
  readonly options: Readonly<Record<string, string>>;
  readonly isDefault: boolean;
  readonly isDiscontinued: boolean;
  readonly position: number;
  /** Prix canonique HT en centimes ; `null` = pas encore tarifé. */
  readonly priceCents: number | null;
  /** Poids net de l'unité vendue, en grammes ; `null` = non renseigné. */
  readonly weightGrams: number | null;
  /** `null` = fiche **non renseignée** ; `[]` = « aucun allergène » déclaré. */
  readonly allergens: readonly string[] | null;
  /** Valeurs nutritionnelles ; `null` = fiche non renseignée. */
  readonly nutrition: VariantNutritionView | null;
}

/**
 * Création d'un produit **avec sa déclinaison par défaut**.
 *
 * Les deux sont indissociables : invariant 2 du socle — un produit a toujours au moins
 * une déclinaison, et exactement une par défaut. Les créer séparément ouvrirait une
 * fenêtre où l'invariant est faux, donc une seule opération atomique.
 */
export interface NewProduct {
  readonly id: string;
  readonly sku: Sku;
  readonly name: LocalizedText;
  readonly slug: LocalizedText;
  readonly kind: ProductKind;
  readonly categoryId: string;
  readonly defaultVariant: {
    readonly id: string;
    readonly sku: Sku;
    readonly name: LocalizedText;
  };
}

export abstract class ProductRepository {
  abstract findById(id: string): Promise<ProductRecord | null>;
  abstract listAll(): Promise<ProductRecord[]>;
  abstract createWithDefaultVariant(product: NewProduct): Promise<void>;
  abstract rename(id: string, name: LocalizedText, slug: LocalizedText): Promise<void>;
  abstract setStatus(id: string, status: ProductStatus): Promise<void>;
  abstract setKind(id: string, kind: ProductKind): Promise<void>;
  abstract moveToCategory(id: string, categoryId: string): Promise<void>;
  /** Tarif canonique HT (centimes) de la déclinaison ; `null` = dé-tarifer. */
  abstract setVariantPrice(variantId: string, priceCents: number | null): Promise<void>;
  /** Poids net (grammes) de la déclinaison ; `null` = effacer. */
  abstract setVariantWeight(variantId: string, weightGrams: number | null): Promise<void>;
}
