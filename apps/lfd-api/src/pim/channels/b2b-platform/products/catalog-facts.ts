import type { SyncMedia, SyncVariant } from "@lfd/catalog-sync";
import { proPriceOf } from "@lfd/pim-contracts";

import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";
import type { IncoProjector } from "../../../allergens/domain/services/inco-projector.js";
import type { ProductRecord } from "../../../catalogue/product/domain/ports/product.repository.js";
import type { ProductStatus } from "../../../catalogue/product/domain/entities/product.js";
import {
  variantGaps,
  type CompletenessRules,
} from "../../../catalogue/product/domain/services/variant-completeness.js";
import type { CatalogFamilyRecord } from "../../../catalogue/shared/domain/ports/catalog-facts.reader.js";
import type { CategoryVatPercents } from "../../../catalogue/shared/domain/ports/catalogue-reader.js";
import {
  effectiveAudience,
  type Audience,
} from "../../../catalogue/shared/domain/value-objects/audience.js";
import { projectVariant, vatOf, type Showcase } from "./projection.js";
import { translationsOf, type CatalogTranslations } from "./translations.js";

export type { CatalogTranslations };

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

/** La famille telle qu'un fait la porte — celle d'une fiche, ou la sienne. */
export interface CatalogFamilyFactBody {
  readonly id: string;
  readonly name: string;
  /** Les traductions du nom — `null` sur un fait d'avant le lot des langues. */
  readonly nameTranslations: CatalogTranslations | null;
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
  /** Les traductions de la ligne de vitrine — `null` sur un fait d'avant le lot des langues. */
  readonly noteTranslations: CatalogTranslations | null;
  readonly image: SyncMedia | null;
  readonly thumbnail: SyncMedia | null;
  readonly operationOnly: boolean;
  readonly requiresCold: boolean;
}

/**
 * Une déclinaison telle qu'un fait la porte : celle du fil, plus les
 * traductions de son nom — le nom d'un article en boutique est celui de sa
 * déclinaison. `null` sur un fait d'avant le lot des langues.
 */
export type CatalogVariantFact = SyncVariant & {
  readonly nameTranslations: CatalogTranslations | null;
};

/**
 * **L'instantané d'une fiche**, tel que `pim.catalog_product_changed` le porte
 * (2a1). Un instantané, pas un diff : il se rejoue seul.
 */
export interface CatalogProductFactBody {
  readonly status: CatalogEntryStatus;
  /** L'audience EFFECTIVE : la dérogation de la fiche, sinon sa famille. */
  readonly audience: Audience;
  /**
   * La fiche hérite-t-elle l'audience de sa famille (`product.audience` vide) ?
   * `null` sur un fait émis avant le lot 3 : on ne sait pas.
   */
  readonly audienceInherited: boolean | null;
  readonly product: CatalogProductHead;
  /**
   * Les déclinaisons **complètes** au sens de `variantGaps` — non arrêtées,
   * avec prix, prix pro résolu, allergènes déclarés et un taux par contexte en
   * service. Ce sont les seules qu'une fiche ACTIVE vend ; une
   * fiche inactive les porte aussi, et la plateforme ne les vend pas.
   */
  readonly variants: readonly CatalogVariantFact[];
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
  /**
   * Les contextes en service et la règle du prix pro — ce que la règle de
   * complétude partagée avec l'activation (`variantGaps`) ne voit pas d'une
   * fiche. La politique n'est jamais `null` (lot S) : sans règles, la saisie
   * se vend.
   */
  readonly rules: CompletenessRules;
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
 * **Projette une fiche en instantané** — pure, comme l'était la projection du
 * push (partie en X4), dont elle reprend la conversion de chaque déclinaison
 * (`projectVariant`).
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
  const variants: CatalogVariantFact[] = [];
  const gaps: Record<string, readonly string[]> = {};
  for (const variant of product.variants) {
    if (variant.isDiscontinued) {
      continue;
    }
    const missing = variantGaps(variant, input.percents, input.rules);
    if (missing.length > 0) {
      gaps[variant.sku] = missing;
      continue;
    }
    variants.push(sellableVariant(variant, input));
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
    },
    variants,
    gaps,
    family: projectFamilyFact(family, input.familyPercents),
  };
}

type VariantOf = ProductRecord["variants"][number];

/**
 * Une déclinaison sans manque, convertie comme le push la convertit.
 *
 * @throws {IncompleteVariantProjectedError} appelée sur une déclinaison
 *   incomplète — faute de cette projection, `variantGaps` devait l'avoir écartée.
 */
function sellableVariant(variant: VariantOf, input: ProductFactInput): CatalogVariantFact {
  const vatRatePercent = vatOf(input.percents);
  const { policy } = input.rules;
  const proPrice =
    variant.priceCents === null
      ? null
      : proPriceOf(variant.priceCents, policy, vatRatePercent, variant.proPriceMillicents);
  if (proPrice === null || variant.priceCents === null) {
    throw new IncompleteVariantProjectedError(variant.sku);
  }
  return {
    ...projectVariant(
      variant,
      proPrice.htMillicents,
      vatRatePercent,
      variant.priceCents,
      input.percents,
      input.inco,
    ),
    nameTranslations: translationsOf(variant.name),
  };
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
