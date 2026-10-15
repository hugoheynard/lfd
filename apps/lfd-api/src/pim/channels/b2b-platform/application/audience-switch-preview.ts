import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type {
  AudienceSwitchIncompleteView,
  AudienceSwitchItemView,
  AudienceSwitchPreviewView,
  AudienceSwitchVariantView,
} from "@lfd/pim-contracts";

import { AccountingRulesReader } from "../../../accounting-rules/domain/ports/accounting-rules.reader.js";
import { readCompletenessRules } from "../../../catalogue/product/application/completeness-support.js";
import type { ProductRecord } from "../../../catalogue/product/domain/ports/product.repository.js";
import {
  variantGaps,
  type CompletenessRules,
} from "../../../catalogue/product/domain/services/variant-completeness.js";
import {
  CatalogueReader,
  type CategoryVatPercents,
} from "../../../catalogue/shared/domain/ports/catalogue-reader.js";
import { ActiveSalesContextsReader } from "../../../sales-contexts/domain/ports/active-sales-contexts.reader.js";
import { B2bMembershipService } from "../membership/membership.service.js";
import {
  publishedB2bClosed,
  publishedUnbound,
  readAudienceSwitchScope,
  soldToday,
} from "./audience-switch-support.js";

export class GetAudienceSwitchPreviewQuery {}

/**
 * **L'aperçu de la bascule vers l'audience** (1f du plan
 * `plan-catalogue-synchronise-par-audience.md`, étape 1 de C7) : les écarts
 * entre « publié au référentiel » et « vendu aux pros » qu'aujourd'hui le lien
 * au canal et la matrice créent, et que l'audience fera disparaître — plus,
 * depuis le lot 2b, les fiches actives que la règle de complétude jugera
 * incomplètes.
 *
 * Vit dans le canal et non dans le catalogue : elle lit le lien au canal, et
 * la dépendance va du canal vers le catalogue, jamais l'inverse (ADR-13).
 *
 * Lecture seule — elle ne corrige rien ; elle rend la liste que Hugo relit
 * avant que la bascule (`ApplyAudienceSwitch`) n'écrive le moindre statut
 * (H7, H10).
 */
@QueryHandler(GetAudienceSwitchPreviewQuery)
export class GetAudienceSwitchPreviewHandler implements IQueryHandler<
  GetAudienceSwitchPreviewQuery,
  AudienceSwitchPreviewView
> {
  constructor(
    private readonly catalogue: CatalogueReader,
    private readonly membership: B2bMembershipService,
    private readonly contexts: ActiveSalesContextsReader,
    private readonly accounting: AccountingRulesReader,
  ) {}

  async execute(): Promise<AudienceSwitchPreviewView> {
    const scope = await readAudienceSwitchScope(this.catalogue, this.membership);
    const [percents, rules] = await Promise.all([
      this.catalogue.vatPercents(scope.published),
      readCompletenessRules(this.contexts, this.accounting),
    ]);
    return {
      soldWithoutAllergens: undeclared(soldToday(scope)),
      publishedUnbound: listed(publishedUnbound(scope)),
      boundUnpublished: listed(
        scope.boundProducts.filter((product) => product.status !== "published"),
      ),
      publishedB2bClosed: listed(publishedB2bClosed(scope)),
      activeIncomplete: incomplete(scope.published, percents, rules),
    };
  }
}

/** Les fiches, citées par SKU — l'ordre que l'écran affiche. */
function listed(products: readonly ProductRecord[]): AudienceSwitchItemView[] {
  return products
    .map((product) => ({ id: product.id, sku: product.sku, name: product.name.fr }))
    .sort((left, right) => left.sku.localeCompare(right.sku));
}

/**
 * Les fiches actives dont une déclinaison non arrêtée est incomplète, jugées
 * par la règle partagée (`variantGaps`) — la même que l'activation et les faits.
 */
function incomplete(
  published: readonly ProductRecord[],
  percents: ReadonlyMap<string, CategoryVatPercents>,
  rules: CompletenessRules,
): AudienceSwitchIncompleteView[] {
  return published
    .map((product) => {
      const live = product.variants.filter((variant) => !variant.isDiscontinued);
      const judged = live.map(
        (variant) =>
          [variant.sku, variantGaps(variant, percents.get(product.id) ?? {}, rules)] as const,
      );
      const gaps = Object.fromEntries(judged.filter(([, missing]) => missing.length > 0));
      return {
        id: product.id,
        sku: product.sku,
        name: product.name.fr,
        keepsSelling: judged.some(([, missing]) => missing.length === 0),
        gaps,
      };
    })
    .filter((entry) => Object.keys(entry.gaps).length > 0)
    .sort((left, right) => left.sku.localeCompare(right.sku));
}

/**
 * Les déclinaisons vendues aux pros sans déclaration d'allergènes — non
 * arrêtées, tarifées, fiche publiée, liée et ouverte au `b2b`. Les faits du
 * catalogue les rangent incomplètes, et l'envoi actuel les écarte depuis le
 * lot 2b (`variant_sans_allergenes`) : Hugo doit le lire avant.
 */
function undeclared(products: readonly ProductRecord[]): AudienceSwitchVariantView[] {
  return products
    .flatMap((product) =>
      product.variants
        .filter(
          (variant) =>
            !variant.isDiscontinued &&
            variant.priceCents !== null &&
            variant.allergenSheet === null,
        )
        .map((variant) => ({
          productId: product.id,
          productSku: product.sku,
          variantSku: variant.sku,
          name: variant.name.fr,
        })),
    )
    .sort((left, right) => left.variantSku.localeCompare(right.variantSku));
}
