import { z } from "zod";

import type { LocalizedText } from "./shared.js";

/**
 * Contrat de fil des **produits** (catalogue). L'édition se fait **par section**
 * (une requête par section, pas par champ) ; d'où plusieurs payloads. Les vues
 * portent la déclinaison par défaut avec son prix/poids/fiche réglementaire.
 */
export const productKindSchema = z.enum(["daily", "made_to_order", "resale"]);
export type ProductKind = z.infer<typeof productKindSchema>;

/** État de publication — rendu seulement (jamais un payload). */
export type ProductStatus = "draft" | "published" | "archived";

/** Valeurs nutritionnelles pour 100 g en **entrée** — chaque champ optionnel. */
const nutritionInputShape = z
  .object({
    energyKcal: z.number().optional(),
    carbsG: z.number().optional(),
    fatG: z.number().optional(),
    proteinG: z.number().optional(),
    glycemicIndex: z.number().optional(),
  })
  .optional();

const editorialShape = {
  descriptionShort: z.string().optional(),
  descriptionLong: z.string().optional(),
  story: z.string().optional(),
  pairing: z.string().optional(),
  brand: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
};

export const createProductPayloadSchema = z.object({
  nameFr: z.string().min(1),
  nameEn: z.string().optional(),
  kind: productKindSchema,
  categoryId: z.string().min(1),
  sku: z.string().optional(),
  allergens: z.array(z.string()).optional(),
  mayContain: z.array(z.string()).optional(),
  nutrition: nutritionInputShape,
  editorial: z.object(editorialShape).optional(),
  media: z
    .array(
      z.object({
        role: z.string(),
        url: z.string(),
        alt: z.string().optional(),
      }),
    )
    .optional(),
});
export type CreateProductPayload = z.infer<typeof createProductPayloadSchema>;

export const updateProductIdentityPayloadSchema = z.object({
  nameFr: z.string().min(1),
  nameEn: z.string().optional(),
  kind: productKindSchema,
  categoryId: z.string().min(1),
});
export type UpdateProductIdentityPayload = z.infer<typeof updateProductIdentityPayloadSchema>;

/** Tarif & logistique d'une déclinaison. `null` = effacer. */
export const updateVariantPricingPayloadSchema = z.object({
  priceCents: z.number().int().min(0).nullable(),
  weightGrams: z.number().int().min(0).nullable(),
});
export type UpdateVariantPricingPayload = z.infer<typeof updateVariantPricingPayloadSchema>;

export const productEditorialPayloadSchema = z.object(editorialShape);
export type ProductEditorialPayload = z.infer<typeof productEditorialPayloadSchema>;

export const declareNutritionPayloadSchema = z.object({
  allergens: z.array(z.string()),
  mayContain: z.array(z.string()).optional(),
  nutrition: nutritionInputShape,
});
export type DeclareNutritionPayload = z.infer<typeof declareNutritionPayloadSchema>;

// ── Vues (formes rendues) ──────────────────────────────────────────────────

/** Fiche nutritionnelle rendue ; chaque champ `null` = non renseigné. */
export interface VariantNutritionView {
  readonly mayContain: readonly string[];
  readonly energyKcal: number | null;
  readonly carbsG: number | null;
  readonly fatG: number | null;
  readonly proteinG: number | null;
  readonly glycemicIndex: number | null;
}

export interface VariantView {
  readonly id: string;
  readonly sku: string;
  readonly name: LocalizedText;
  readonly options: Readonly<Record<string, string>>;
  readonly isDefault: boolean;
  readonly isDiscontinued: boolean;
  readonly position: number;
  /** Prix canonique HT en centimes ; `null` = pas encore tarifé. */
  readonly priceCents: number | null;
  readonly weightGrams: number | null;
  /** `null` = fiche non renseignée ; `[]` = « aucun allergène » déclaré. */
  readonly allergens: readonly string[] | null;
  readonly nutrition: VariantNutritionView | null;
}

export interface ProductView {
  readonly id: string;
  readonly sku: string;
  readonly name: LocalizedText;
  readonly slug: LocalizedText;
  readonly kind: ProductKind;
  readonly categoryId: string;
  readonly status: ProductStatus;
  readonly variants: readonly VariantView[];
}

/** Couche éditoriale rendue en FR plat ; `null` = non renseigné. */
export interface ProductEditorialView {
  readonly descriptionShort: string | null;
  readonly descriptionLong: string | null;
  readonly story: string | null;
  readonly pairing: string | null;
  readonly brand: string | null;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
}

/** Détail enrichi (socle + éditorial) — pour la page d'édition produit. */
export type ProductDetailView = ProductView & {
  readonly editorial: ProductEditorialView | null;
};
