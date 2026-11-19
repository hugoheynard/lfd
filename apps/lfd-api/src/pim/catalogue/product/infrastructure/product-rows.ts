import { Product } from "../domain/entities/product.js";
import type { ProductKind, ProductStatus } from "../domain/entities/product.js";
import type { VariantSnapshot } from "../domain/entities/variant.js";
import { saleTermsOf } from "./variant-sale-terms-columns.js";
import { minQuantitiesOf, type MinQuantityColumns } from "./variant-min-quantities-columns.js";
import {
  readLocalizedColumn,
  readStringArrayColumn,
  readStringMapColumn,
} from "../../../shared/json-readers.js";
import { audience } from "../../shared/domain/value-objects/audience.js";

/**
 * **Une fiche relue** : les lignes que Prisma rend, et leur traduction en
 * agrégat. Le dépôt des fiches et la lecture de toutes les fiches les
 * partagent, pour qu'une fiche se relise d'une seule façon.
 */

/** La moitié « sécurité » : ce que la déclinaison contient, et ses traces. */
interface AllergensRow {
  allergens: unknown;
  mayContain: unknown;
}

/** La moitié « valeurs » : les mentions de l'annexe XV, plus l'indice. */
interface NutritionRow {
  energyKcal: number | null;
  fatG: number | null;
  saturatedFatG: number | null;
  carbsG: number | null;
  sugarsG: number | null;
  proteinG: number | null;
  saltG: number | null;
  glycemicIndex: number | null;
}

interface VariantRow extends MinQuantityColumns {
  id: string;
  sku: string;
  name: unknown;
  internalLabel: string | null;
  options: unknown;
  isDefault: boolean;
  isDiscontinued: boolean;
  detachedToProductId: string | null;
  detachedFromVariantId: string | null;
  position: number;
  priceCents: number | null;
  weightGrams: number | null;
  proPriceMillicents: number | null;
  proPricePerKgMillicents: number | null;
  publicPricePerKgTtcCents: number | null;
  pricePerKgShownPublic: boolean;
  pricePerKgShownPro: boolean;
  saleUnit: string;
  weightMinGrams: number | null;
  weightStepGrams: number | null;
  hasBeenPublished: boolean;
  regulatoryFollowsDefault: boolean;
  pricingFollowsDefault: boolean;
  nutritionFollowsDefault: boolean;
  minQuantityFollowsDefault: boolean;
  customRecipe: boolean;
  allergenSheet: AllergensRow | null;
  nutritionValues: NutritionRow | null;
}

/** Une fiche lue avec ses déclinaisons et ses taux joints — ce que `toProduct` relit. */
export interface ProductRow {
  id: string;
  sku: string;
  name: unknown;
  slug: unknown;
  kind: ProductKind;
  categoryId: string;
  status: ProductStatus;
  operationOnly: boolean;
  requiresCold: boolean;
  audience: string | null;
  originVariantId: string | null;
  variantsAsTiles: boolean;
  variants: VariantRow[];
  contextVat: readonly { vatRateId: string; context: { key: string } }[];
}

/**
 * Les dérogations de TVA voyagent AVEC le produit : elles sont à lui. La
 * dérogation des canaux n'est ni lue ni écrite : la révision ne photographie
 * pas `soldContexts`, et ses tables restent figées.
 */
export const PRODUCT_INCLUDE = {
  // Les DEUX tables de la fiche réglementaire ; leur absence est une
  // information : personne ne s'est prononcé.
  variants: {
    orderBy: { position: "asc" },
    include: { allergenSheet: true, nutritionValues: true },
  },
  contextVat: { select: { vatRateId: true, context: { select: { key: true } } } },
} as const;

function toVariant(row: VariantRow): VariantSnapshot {
  return {
    id: row.id,
    sku: row.sku,
    name: readLocalizedColumn(row.name, "variant.name"),
    internalLabel: row.internalLabel,
    options: readStringMapColumn(row.options, "variant.options"),
    isDefault: row.isDefault,
    isDiscontinued: row.isDiscontinued,
    detachedToProductId: row.detachedToProductId,
    detachedFromVariantId: row.detachedFromVariantId,
    position: row.position,
    priceCents: row.priceCents,
    weightGrams: row.weightGrams,
    proPriceMillicents: row.proPriceMillicents,
    proPricePerKgMillicents: row.proPricePerKgMillicents,
    publicPricePerKgTtcCents: row.publicPricePerKgTtcCents,
    pricePerKgShownPublic: row.pricePerKgShownPublic,
    pricePerKgShownPro: row.pricePerKgShownPro,
    ...saleTermsOf(row),
    regulatoryFollowsDefault: row.regulatoryFollowsDefault,
    pricingFollowsDefault: row.pricingFollowsDefault,
    nutritionFollowsDefault: row.nutritionFollowsDefault,
    minQuantities: minQuantitiesOf(row),
    minQuantityFollowsDefault: row.minQuantityFollowsDefault,
    customRecipe: row.customRecipe,
    // 🔴 Pas de ligne = personne n'a déclaré (`null`) ; une ligne, même à
    // tableau vide, est une AFFIRMATION (« aucun allergène »). C'est tout
    // l'intérêt d'une table séparée : le tri-état est structurel.
    allergenSheet: toAllergenSheet(row.allergenSheet),
    nutrition: toNutrition(row.nutritionValues),
  };
}

/**
 * La déclaration d'allergènes, **une ligne ou rien**.
 *
 * Les traces sortent d'ici et non de la nutrition : une trace EST un allergène,
 * elle vient de la même ligne, et l'absence de cette ligne est le seul silence.
 */
function toAllergenSheet(row: AllergensRow | null): VariantSnapshot["allergenSheet"] {
  if (row === null) {
    return null;
  }
  return {
    declared: readStringArrayColumn(row.allergens, "variant_allergens.allergens"),
    mayContain: readStringArrayColumn(row.mayContain, "variant_allergens.may_contain"),
  };
}

/**
 * Les valeurs pour 100 g, **une ligne ou rien**.
 *
 * `null` quand personne n'en a saisi aucune — et non un bloc de huit `null`,
 * qui laisserait croire qu'une fiche existe. Déclarer un allergène ne fabrique
 * donc pas de tableau nutritionnel vide.
 */
function toNutrition(row: NutritionRow | null): VariantSnapshot["nutrition"] {
  if (row === null) {
    return null;
  }
  return {
    energyKcal: row.energyKcal,
    fatG: row.fatG,
    saturatedFatG: row.saturatedFatG,
    carbsG: row.carbsG,
    sugarsG: row.sugarsG,
    proteinG: row.proteinG,
    saltG: row.saltG,
    glycemicIndex: row.glycemicIndex,
  };
}

export function toProduct(row: ProductRow): Product {
  return Product.reconstitute({
    id: row.id,
    sku: row.sku,
    name: readLocalizedColumn(row.name, "product.name"),
    slug: readLocalizedColumn(row.slug, "product.slug"),
    kind: row.kind,
    categoryId: row.categoryId,
    status: row.status,
    operationOnly: row.operationOnly,
    requiresCold: row.requiresCold,
    // Revalidée : une ligne relue n'est pas passée par le contrat.
    audience: row.audience === null ? null : audience(row.audience),
    originVariantId: row.originVariantId,
    variantsAsTiles: row.variantsAsTiles,
    variants: row.variants.map(toVariant),
    vatByContext: Object.fromEntries(
      row.contextVat.map((line) => [line.context.key, line.vatRateId]),
    ),
  });
}
