import { currentRequestContext } from "../../../../platform/context/request-context.store.js";

import type { ProductSnapshot } from "../domain/entities/product.js";
import type { VariantSnapshot } from "../domain/entities/variant.js";
import { saleTermsColumns } from "./variant-sale-terms-columns.js";
import { minQuantityColumns } from "./variant-min-quantities-columns.js";
import { localizedColumn } from "../../../shared/json-readers.js";

/**
 * **Une fiche écrite** : les colonnes que le dépôt des fiches pose, tirées de
 * l'instantané NON résolu.
 */

/**
 * QUI a écrit — la colonne système d'ADR-11.
 *
 * Ici, dans l'infrastructure, et non dans un handler : c'est le seul endroit
 * qu'aucune écriture ne peut contourner. Un handler qui devrait y penser est un
 * handler qui peut l'oublier, et une colonne remplie une fois sur deux est pire
 * que vide — on la croit.
 *
 * `null` hors requête (un seed, un cron) : c'est exactement ce qui est vrai, et
 * l'inventer serait pire que l'avouer.
 */
function writtenBy(): string | null {
  return currentRequestContext()?.actor.id ?? null;
}

/** Les colonnes du produit lui-même — les déclinaisons ont les leurs. */
export function productColumns(snapshot: ProductSnapshot) {
  return {
    updatedBy: writtenBy(),
    name: localizedColumn(snapshot.name),
    slug: localizedColumn(snapshot.slug),
    kind: snapshot.kind,
    categoryId: snapshot.categoryId,
    status: snapshot.status,
    operationOnly: snapshot.operationOnly,
    requiresCold: snapshot.requiresCold,
    audience: snapshot.audience,
    originVariantId: snapshot.originVariantId ?? null,
    variantsAsTiles: snapshot.variantsAsTiles ?? true,
    // `custom_recipe` de la fiche n'est ni lu ni écrit : colonne morte, qui
    // garde sa valeur pour qu'un retour au code d'avant ne rouvre rien.
  };
}

/**
 * Les colonnes qu'une déclinaison RÉÉCRIT à chaque passage. Ni son SKU, ni ses
 * options, ni la trace de son détachement d'origine : ils naissent avec elle
 * ({@link variantCreateColumns}) et ne bougent plus.
 */
export function variantUpdateColumns(variant: VariantSnapshot) {
  return {
    name: localizedColumn(variant.name),
    internalLabel: variant.internalLabel ?? null,
    isDefault: variant.isDefault,
    isDiscontinued: variant.isDiscontinued,
    detachedToProductId: variant.detachedToProductId ?? null,
    position: variant.position,
    priceCents: variant.priceCents,
    weightGrams: variant.weightGrams,
    proPriceMillicents: variant.proPriceMillicents,
    proPricePerKgMillicents: variant.proPricePerKgMillicents,
    publicPricePerKgTtcCents: variant.publicPricePerKgTtcCents,
    pricePerKgShownPublic: variant.pricePerKgShownPublic,
    pricePerKgShownPro: variant.pricePerKgShownPro,
    ...saleTermsColumns(variant),
    regulatoryFollowsDefault: variant.regulatoryFollowsDefault,
    pricingFollowsDefault: variant.pricingFollowsDefault,
    nutritionFollowsDefault: variant.nutritionFollowsDefault,
    minQuantityFollowsDefault: variant.minQuantityFollowsDefault,
    customRecipe: variant.customRecipe ?? false,
    audience: variant.audience ?? null,
    ...minQuantityColumns(variant.minQuantities),
  };
}

/** Les colonnes d'une déclinaison qui naît sous une fiche déjà écrite. */
export function variantCreateColumns(productId: string, variant: VariantSnapshot) {
  return {
    ...variantUpdateColumns(variant),
    id: variant.id,
    productId,
    sku: variant.sku,
    options: { ...variant.options },
    detachedFromVariantId: variant.detachedFromVariantId ?? null,
  };
}
