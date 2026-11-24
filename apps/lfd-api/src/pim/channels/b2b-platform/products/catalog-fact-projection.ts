import { proPriceOf } from "@lfd/pim-contracts";

import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";
import type { ProductRecord } from "../../../catalogue/product/domain/ports/product.repository.js";
import type { ProductStatus } from "../../../catalogue/product/domain/entities/product.js";
import { variantGaps } from "../../../catalogue/product/domain/services/variant-completeness.js";
import type { CatalogFamilyRecord } from "../domain/ports/catalog-facts.reader.js";
import type { CategoryVatPercents } from "../../../catalogue/shared/domain/value-objects/vat-percents.js";
import {
  effectiveAudience,
  servedAudiences,
  type Audience,
} from "../../../catalogue/shared/domain/value-objects/audience.js";
import type {
  CatalogEntryStatus,
  CatalogFamilyFactBody,
  CatalogProductFactBody,
  CatalogVariantFact,
  ProductFactInput,
} from "./catalog-facts.js";
import { projectVariant, vatOf } from "./projection.js";
import { translationsOf, variantNameTranslationsOf } from "./translations.js";

/**
 * **La projection des faits du catalogue** — pure : ce que `catalog-facts.ts`
 * déclare comme contrat, calculé depuis la fiche et sa famille résolues.
 */

const STATUS_OF: Readonly<Record<ProductStatus, CatalogEntryStatus>> = {
  draft: "inactive",
  published: "active",
  archived: "archived",
  // Une supprimée est une archivée pour le commerce : son miroir l'a déjà
  // retirée à l'archivage, et n'a pas à connaître la différence.
  deleted: "archived",
};

/** La famille projetée — pure, le taux part tel quel, `null` compris. */
export function projectFamilyFact(
  family: CatalogFamilyRecord,
  percents: CategoryVatPercents,
): CatalogFamilyFactBody {
  return {
    id: family.id,
    name: family.name.fr,
    nameTranslations: translationsOf(family.name),
    slug: family.slug.fr,
    parentId: family.parentId,
    position: family.position,
    vatRatePercent: vatOf(percents),
    audience: family.audience,
    archived: family.isArchived,
  };
}

/**
 * **Projette une fiche en instantané** — pure ; chaque déclinaison passe par
 * la conversion commune (`projectVariant`).
 *
 * Elle **n'écarte rien en silence** : une déclinaison incomplète part dans
 * `gaps`, avec ce qui lui manque. La projection juge l'état final, quel que
 * soit le geste, et une déclinaison incomplète est invendable par
 * construction. Elle ne filtre pas par canal : c'est l'audience qui dit à qui
 * la fiche se vend.
 */
export function projectProductFact(input: ProductFactInput): CatalogProductFactBody {
  const { product, family, showcase } = input;
  const audience = effectiveAudience(null, product.audience, family.audience);
  const variants: CatalogVariantFact[] = [];
  const gaps: Record<string, readonly string[]> = {};
  for (const variant of product.variants) {
    if (variant.isDiscontinued) {
      continue;
    }
    // Chaque déclinaison est jugée et émise à SON audience (A5, A6 de
    // `plan-audience-par-declinaison.md`) ; l'en-tête garde celle de la fiche.
    const own = effectiveAudience(variant.audience ?? null, product.audience, family.audience);
    const missing = variantGaps(variant, input.percents, input.rules, own);
    if (missing.length > 0) {
      gaps[variant.sku] = missing;
      continue;
    }
    variants.push(sellableVariant(variant, input, own));
  }
  return {
    status: STATUS_OF[product.status],
    audience,
    audienceInherited: product.audience === null,
    product: {
      id: product.id,
      sku: product.sku,
      name: product.name.fr,
      categoryId: product.categoryId,
      kind: product.kind,
      note: showcase?.note ?? null,
      noteTranslations: showcase?.noteTranslations ?? {},
      image: showcase?.image ?? null,
      thumbnail: showcase?.thumbnail ?? null,
      operationOnly: product.operationOnly,
      requiresCold: product.requiresCold,
      variantsAsTiles: product.variantsAsTiles ?? true,
      detachedFromSku: input.detachedFromSku,
    },
    variants,
    gaps,
    family: projectFamilyFact(family, input.familyPercents),
  };
}

type VariantOf = ProductRecord["variants"][number];

/**
 * Une déclinaison sans manque, convertie.
 *
 * Un prix absent part `null` — et `publicByContext` vide sans prix public :
 * la déclinaison ne se vend qu'à l'audience dont elle a le prix.
 *
 * Une déclinaison réservée au réassort (`resupply`) part sans prix : elle ne
 * se vend à personne, et `variantGaps` n'en exige aucun.
 *
 * @throws {IncompleteVariantProjectedError} appelée sur une déclinaison vendue
 *   à un acheteur sans AUCUN prix — faute de cette projection, `variantGaps`
 *   devait l'avoir écartée.
 */
function sellableVariant(
  variant: VariantOf,
  input: ProductFactInput,
  audience: Audience,
): CatalogVariantFact {
  const vatRatePercent = vatOf(input.percents);
  const proPrice = proPriceOf(vatRatePercent, variant.proPriceMillicents);
  const sold = servedAudiences(audience).length > 0;
  if (sold && proPrice === null && variant.priceCents === null) {
    throw new IncompleteVariantProjectedError(variant.sku);
  }
  return {
    ...projectVariant(
      variant,
      proPrice?.htMillicents ?? null,
      vatRatePercent,
      variant.priceCents,
      input.percents,
      input.naming,
      { cited: input.cited, catalogueUnion: input.catalogueUnion },
    ),
    nameTranslations: variantNameTranslationsOf(variant.name, input.product.name),
    detachedFromVariantSku:
      variant.detachedFromVariantId == null
        ? null
        : (input.variantOrigins.get(variant.detachedFromVariantId) ?? null),
    audience,
  };
}

/** Une déclinaison sans aucun prix est arrivée jusqu'à la conversion : faute de la projection. */
export class IncompleteVariantProjectedError extends TechnicalError {
  constructor(sku: string) {
    super(
      "catalog_facts.incomplete_variant_projected",
      `La déclinaison ${sku} a été projetée comme vendable sans aucun prix (ni public, ni pro calculable). ` +
        "C'est une faute de la projection des faits du catalogue, pas de la fiche : " +
        "aucun fait n'est parti pour ce geste. Signaler l'erreur ; la fiche se réémet une fois corrigée.",
    );
  }
}
