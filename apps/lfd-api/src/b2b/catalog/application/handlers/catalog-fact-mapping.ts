import type { CatalogFamilyFactBody } from "../../../../pim/channels/b2b-platform/products/catalog-facts.js";
import type { CatalogProductChangedFact } from "../../../../pim/channels/b2b-platform/products/catalog-product-changed.fact.js";
import type { ReceivedCatalogProduct } from "../../domain/catalog-product-facts.js";
import type { CatalogCategoryFacts } from "../../domain/ports/catalog-category.projection.js";
import { pimImageOf } from "../pim-image.js";

/**
 * Le fait d'une fiche, traduit dans les mots de la plateforme.
 *
 * Les déclinaisons deviennent des faits d'articles par la même traduction
 * que l'ingestion d'un instantané (`ingest-catalog.service.ts`, `factsOf`) —
 * aux limites de commande près : ce sont des règles globales, qui ne
 * voyagent pas avec une fiche (C3), et l'écriture ne les touche pas.
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
    gaps: body.gaps,
    seq: fact.seq,
    receivedAt,
    items: body.variants.map((variant) => ({
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
      publicByContext: variant.publicByContext ?? null,
      allergens: variant.allergens,
      allergenLabels: variant.allergenLabels,
      orderTimeLimit: null,
      note: product.note,
      image: pimImageOf(product.image),
      thumbnail: pimImageOf(product.thumbnail),
      operationOnly: product.operationOnly,
      requiresCold: product.requiresCold,
      receivedAt,
    })),
  };
}

/** La famille d'un fait — la sienne, ou celle qu'une fiche apporte. */
export function receivedFamilyOf(
  family: CatalogFamilyFactBody,
  receivedAt: Date,
): CatalogCategoryFacts {
  return {
    id: family.id,
    name: family.name,
    slug: family.slug,
    parentId: family.parentId,
    position: family.position,
    vatRatePercent: family.vatRatePercent,
    receivedAt,
  };
}
