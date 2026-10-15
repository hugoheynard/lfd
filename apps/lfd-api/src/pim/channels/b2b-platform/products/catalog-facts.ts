import type { SyncMedia, SyncVariant } from "@lfd/catalog-sync";
import { proPriceOf, type ProPricePolicy } from "@lfd/pim-contracts";

import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";
import type { IncoProjector } from "../../../allergens/domain/services/inco-projector.js";
import type { ProductRecord } from "../../../catalogue/product/domain/ports/product.repository.js";
import type { ProductStatus } from "../../../catalogue/product/domain/entities/product.js";
import { BILLING_CONTEXT_OF } from "../../../catalogue/product/domain/services/activation-gaps.js";
import type { CatalogFamilyRecord } from "../../../catalogue/shared/domain/ports/catalog-facts.reader.js";
import type { CategoryVatPercents } from "../../../catalogue/shared/domain/ports/catalogue-reader.js";
import {
  effectiveAudience,
  servedAudiences,
  type Audience,
} from "../../../catalogue/shared/domain/value-objects/audience.js";
import { projectVariant, vatOf, type Showcase } from "./projection.js";

/**
 * L'état d'une fiche **dans les mots de l'écran** (C1) : la valeur d'enum du
 * référentiel (`draft`, `published`) ne se renomme pas en base, mais elle ne
 * traverse pas non plus — la plateforme n'a jamais su ce qu'était un brouillon.
 */
export type CatalogEntryStatus = "inactive" | "active" | "archived";

const STATUS_OF: Readonly<Record<ProductStatus, CatalogEntryStatus>> = {
  draft: "inactive",
  published: "active",
  archived: "archived",
};

/** Ce qui manque à une déclinaison pour se vendre. */
export const PRICE_GAP = "price";
export const ALLERGENS_GAP = "allergens";
/** Le rapport pro n'est pas réglé : aucun prix pro ne se calcule. */
export const PRO_PRICE_RULE_GAP = "pro_price_rule";
/**
 * Sous la méthode `entered` (lot P, P4), la déclinaison n'a pas de prix pro HT
 * saisi : elle n'est jamais vendue, et la porte n'est pas appelée.
 */
export const PRO_PRICE_GAP = "pro_price";
/** Un taux manque au contexte nommé — `vat:b2b`, `vat:takeaway`. */
export const VAT_GAP_PREFIX = "vat:";

/** La famille telle qu'un fait la porte — celle d'une fiche, ou la sienne. */
export interface CatalogFamilyFactBody {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly parentId: string | null;
  readonly position: number;
  /** Le taux du contexte `b2b`, `null` s'il n'est pas réglé — jamais inventé. */
  readonly vatRatePercent: number | null;
  readonly audience: Audience;
  readonly archived: boolean;
}

/** La fiche, sans ses déclinaisons — ce que la plateforme range par fiche. */
export interface CatalogProductHead {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly categoryId: string;
  readonly kind: ProductRecord["kind"];
  readonly note: string | null;
  readonly image: SyncMedia | null;
  readonly thumbnail: SyncMedia | null;
  readonly operationOnly: boolean;
  readonly requiresCold: boolean;
}

/**
 * **L'instantané d'une fiche**, tel que `pim.catalog_product_changed` le porte
 * (2a1). Un instantané, pas un diff : il se rejoue seul.
 */
export interface CatalogProductFactBody {
  readonly status: CatalogEntryStatus;
  /** L'audience EFFECTIVE : la dérogation de la fiche, sinon sa famille. */
  readonly audience: Audience;
  readonly product: CatalogProductHead;
  /**
   * Les déclinaisons **complètes** — non arrêtées, avec prix, taux et
   * allergènes déclarés. Ce sont les seules qu'une fiche ACTIVE vend ; une
   * fiche inactive les porte aussi, et la plateforme ne les vend pas.
   */
  readonly variants: readonly SyncVariant[];
  /** SKU de déclinaison → ce qui lui manque. Une déclinaison arrêtée n'y est pas : rien ne lui manque, elle ne se vend plus. */
  readonly gaps: Readonly<Record<string, readonly string[]>>;
  /** La famille de la fiche : la plateforme la crée si elle ne la connaît pas encore. */
  readonly family: CatalogFamilyFactBody;
}

/** Ce que la projection d'une fiche reçoit, tout résolu — elle reste pure. */
export interface ProductFactInput {
  readonly product: ProductRecord;
  readonly family: CatalogFamilyRecord;
  readonly familyPercents: CategoryVatPercents;
  /** Les taux effectifs de la fiche (dérogation par-dessus la famille). */
  readonly percents: CategoryVatPercents;
  /** `null` = le rapport pro n'est pas réglé : rien ne se vend aux pros. */
  readonly policy: ProPricePolicy | null;
  readonly inco: IncoProjector;
  readonly showcase: Showcase | undefined;
}

/** La famille projetée — pure, le taux part tel quel, `null` compris. */
export function projectFamilyFact(
  family: CatalogFamilyRecord,
  percents: CategoryVatPercents,
): CatalogFamilyFactBody {
  return {
    id: family.id,
    name: family.name.fr,
    slug: family.slug.fr,
    parentId: family.parentId,
    position: family.position,
    vatRatePercent: vatOf(percents),
    audience: family.audience,
    archived: family.isArchived,
  };
}

/**
 * **Projette une fiche en instantané** — pure, comme `projectCatalog`, dont
 * elle reprend la conversion de chaque déclinaison (`projectVariant`) pour
 * qu'un prix poussé et un prix émis ne puissent pas diverger.
 *
 * Ce qu'elle fait de plus que le push : elle **n'écarte rien en silence**. Une
 * déclinaison incomplète part dans `gaps`, avec ce qui lui manque — c'est C1 :
 * la projection juge l'état final, quel que soit le geste, et une déclinaison
 * incomplète est invendable par construction.
 *
 * Ce qu'elle ne fait plus : filtrer par la matrice des canaux. C'est
 * l'audience qui dit à qui la fiche se vend (C2, C5).
 */
export function projectProductFact(input: ProductFactInput): CatalogProductFactBody {
  const { product, family, showcase } = input;
  const audience = effectiveAudience(product.audience, family.audience);
  const variants: SyncVariant[] = [];
  const gaps: Record<string, readonly string[]> = {};
  for (const variant of product.variants) {
    if (variant.isDiscontinued) {
      continue;
    }
    const missing = gapsOf(variant, input, audience);
    if (missing.length > 0) {
      gaps[variant.sku] = missing;
      continue;
    }
    variants.push(sellableVariant(variant, input));
  }
  return {
    status: STATUS_OF[product.status],
    audience,
    product: {
      id: product.id,
      sku: product.sku,
      name: product.name.fr,
      categoryId: product.categoryId,
      kind: product.kind,
      note: showcase?.note ?? null,
      image: showcase?.image ?? null,
      thumbnail: showcase?.thumbnail ?? null,
      operationOnly: product.operationOnly,
      requiresCold: product.requiresCold,
    },
    variants,
    gaps,
    family: projectFamilyFact(family, input.familyPercents),
  };
}

type VariantOf = ProductRecord["variants"][number];

/**
 * Ce qui manque à une déclinaison, dans l'ordre où l'écran le dira.
 *
 * 🔴 **Le taux `b2b` est exigé quelle que soit l'audience.** La plateforme
 * range un article vendable avec son prix PRO hors taxe
 * (`catalog_items.price_millicents`, `NOT NULL`), et ce prix ne se calcule pas
 * sans lui. Une fiche « public » sans taux `b2b` reste donc dans `gaps` : on
 * ne fabrique pas un prix pro que personne n'a décidé pour pouvoir écrire la
 * ligne.
 */
function gapsOf(variant: VariantOf, input: ProductFactInput, audience: Audience): string[] {
  const missing: string[] = [];
  if (variant.priceCents === null) {
    missing.push(PRICE_GAP);
  }
  if (variant.allergenSheet === null) {
    missing.push(ALLERGENS_GAP);
  }
  if (input.policy === null) {
    missing.push(PRO_PRICE_RULE_GAP);
  } else if (input.policy.method === "entered" && variant.proPriceMillicents === null) {
    missing.push(PRO_PRICE_GAP);
  }
  const contexts = new Set([
    BILLING_CONTEXT_OF.pro,
    ...servedAudiences(audience).map((served) => BILLING_CONTEXT_OF[served]),
  ]);
  for (const context of contexts) {
    if (input.percents[context] === undefined) {
      missing.push(`${VAT_GAP_PREFIX}${context}`);
    }
  }
  return missing;
}

/**
 * Une déclinaison sans manque, convertie comme le push la convertit.
 *
 * @throws {IncompleteVariantProjectedError} appelée sur une déclinaison
 *   incomplète — faute de cette projection, `gapsOf` devait l'avoir écartée.
 */
function sellableVariant(variant: VariantOf, input: ProductFactInput): SyncVariant {
  const vatRatePercent = vatOf(input.percents);
  const proPrice =
    variant.priceCents === null || input.policy === null
      ? null
      : proPriceOf(variant.priceCents, input.policy, vatRatePercent, variant.proPriceMillicents);
  if (proPrice === null || variant.priceCents === null) {
    throw new IncompleteVariantProjectedError(variant.sku);
  }
  return projectVariant(
    variant,
    proPrice.htMillicents,
    vatRatePercent,
    variant.priceCents,
    input.percents,
    input.inco,
  );
}

/** Une déclinaison sans prix pro est arrivée jusqu'à la conversion : faute de la projection. */
export class IncompleteVariantProjectedError extends TechnicalError {
  constructor(sku: string) {
    super(
      "catalog_facts.incomplete_variant_projected",
      `La déclinaison ${sku} a été projetée comme vendable sans prix pro calculable. ` +
        "C'est une faute de la projection des faits du catalogue, pas de la fiche : " +
        "aucun fait n'est parti pour ce geste. Signaler l'erreur ; la fiche se réémet une fois corrigée.",
    );
  }
}
