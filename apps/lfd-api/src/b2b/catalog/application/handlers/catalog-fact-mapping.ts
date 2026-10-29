import type { CatalogFamilyFactBody } from "../../../../pim/channels/b2b-platform/products/catalog-facts.js";
import type { CatalogProductChangedFact } from "../../../../pim/channels/b2b-platform/products/catalog-product-changed.fact.js";
import type { ReceivedCatalogProduct } from "../../domain/catalog-product-facts.js";
import type { ReceivedCatalogFamily } from "../../domain/ports/catalog-family-facts.projection.js";
import { NO_CATALOG_MIN_QUANTITIES } from "../../domain/catalog-min-quantities.js";
import { pimImageOf } from "../pim-image.js";

/**
 * Le fait d'une fiche, traduit dans les mots de la plateforme.
 *
 * Les déclinaisons deviennent des faits d'articles par la même traduction
 * que l'ingestion d'un instantané (`ingest-catalog.service.ts`, `factsOf`) —
 * aux limites de commande près : ce sont des règles globales, qui voyagent à
 * part (`pim.catalog_rules_changed`, lot 2b) ; le récepteur les descend sur
 * les articles de la fiche après l'écriture (`OrderLimitsRefresher`). D'où
 * l'identifiant de déclinaison, que seul le fait porte.
 */
export function receivedProductOf(fact: CatalogProductChangedFact): ReceivedCatalogProduct {
  const { body } = fact;
  const receivedAt = new Date(fact.emittedAt);
  const { product } = body;
  return {
    productId: fact.productId,
    productSku: product.sku,
    name: product.name,
    categoryId: product.categoryId,
    status: body.status,
    audience: body.audience,
    audienceInherited: body.audienceInherited,
    gaps: body.gaps,
    seq: fact.seq,
    receivedAt,
    items: body.variants.map((variant) => ({
      variantId: variant.id,
      sku: variant.sku,
      productId: product.id,
      productSku: product.sku,
      name: variant.name,
      kind: product.kind,
      categoryId: product.categoryId,
      priceMillicents: variant.priceMillicents,
      weightGrams: variant.weightGrams,
      isDefault: variant.isDefault,
      position: variant.position,
      vatRatePercent: variant.vatRatePercent,
      publicTtcCents: variant.publicTtcCents ?? null,
      proPricePerKgMillicents: variant.proPricePerKgMillicents,
      publicPricePerKgTtcCents: variant.publicPricePerKgTtcCents,
      saleUnit: variant.saleUnit,
      weightMinGrams: variant.weightMinGrams,
      weightStepGrams: variant.weightStepGrams,
      minQuantities: variant.minQuantities ?? NO_CATALOG_MIN_QUANTITIES,
      publicByContext: variant.publicByContext ?? null,
      allergens: variant.allergens,
      allergenLabels: variant.allergenLabels,
      mayContain: variant.mayContain,
      allergensPrecautionary: variant.allergensPrecautionary,
      allergenTexts: variant.allergenTexts,
      orderTimeLimit: null,
      note: product.note,
      nameTranslations: variant.nameTranslations,
      noteTranslations: product.noteTranslations,
      image: pimImageOf(product.image),
      thumbnail: pimImageOf(product.thumbnail),
      operationOnly: product.operationOnly,
      requiresCold: product.requiresCold,
      // Deux faits de la fiche descendus sur chaque article (fil v16,
      // `plan-declinaisons-en-vignette.md`) : l'option, et le nom de la fiche
      // qui précède celui de la déclinaison sur sa vignette.
      variantsAsTiles: product.variantsAsTiles,
      productName: product.name,
      // L7 de `plan-pro-voit-les-declinaisons.md` : la filiation du détachement.
      detachedFromSku: product.detachedFromSku,
      receivedAt,
    })),
  };
}

/**
 * La famille d'un fait — la sienne, ou celle qu'une fiche apporte — avec son
 * audience et son archivage (lot 2b).
 */
export function receivedFamilyOf(
  family: CatalogFamilyFactBody,
  receivedAt: Date,
): ReceivedCatalogFamily {
  return {
    audience: family.audience,
    archived: family.archived,
    id: family.id,
    name: family.name,
    nameTranslations: family.nameTranslations,
    slug: family.slug,
    parentId: family.parentId,
    position: family.position,
    vatRatePercent: family.vatRatePercent,
    receivedAt,
  };
}
