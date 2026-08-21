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

/**
 * Ce qu'on a constaté d'un visuel qu'on héberge. Tout est nullable : un visuel
 * saisi par son URL n'a rien de tout ça, et `null` veut dire « pas mesuré »,
 * jamais « zéro » — un écran ne doit pas le coercer en dimension.
 */
export interface MediaFactsView {
  readonly width: number | null;
  readonly height: number | null;
  readonly bytes: number | null;
  readonly contentType: string | null;
}

/** Un visuel attaché à un produit, tel que l'écran le lit et le renvoie. */
export interface ProductMediaView extends MediaFactsView {
  /** `hero`, `gallery`, `lifestyle`, `thumbnail`, `print`. */
  readonly role: string;
  readonly url: string;
  readonly alt: string;
}

/**
 * Ce que rend un dépôt d'image : l'entrée de bibliothèque créée.
 *
 * L'écran n'a plus qu'à l'ajouter à sa liste et à enregistrer la section. Les
 * dimensions viennent d'ici et **ne repartent pas** dans l'enregistrement : le
 * serveur les a mesurées, il les relira lui-même au rattachement plutôt que de
 * les redemander à un navigateur qui pourrait en dire autre chose.
 */
export interface UploadedMediaView extends MediaFactsView {
  readonly id: string;
  readonly url: string;
}

/** Détail enrichi (socle + éditorial + visuels) — pour la page d'édition. */
export type ProductDetailView = ProductView & {
  readonly editorial: ProductEditorialView | null;
  /**
   * Les visuels attachés, dans l'ordre. Ils étaient acceptés à la CRÉATION et
   * jamais relus : le formulaire ouvrait un panneau vide sur un produit qui
   * avait des images, et le premier enregistrement les aurait effacées.
   */
  readonly media: readonly ProductMediaView[];
};

/**
 * Le panneau **Visuels**, enregistré d'un bloc.
 *
 * Un REMPLACEMENT et non un ajout : l'écran envoie la liste entière, dans son
 * ordre, et c'est elle qui fait foi. Retirer une image et réordonner les autres
 * sont le même geste ; les séparer en deux routes obligerait l'écran à
 * décomposer ce que l'utilisateur a fait en une suite d'appels dont l'échec
 * partiel laisserait un ordre incohérent.
 */
export const setProductMediaPayloadSchema = z.object({
  media: z.array(
    z.object({
      role: z.string().min(1),
      url: z.string().min(1),
      alt: z.string().optional(),
    }),
  ),
});
export type SetProductMediaPayload = z.infer<typeof setProductMediaPayloadSchema>;
