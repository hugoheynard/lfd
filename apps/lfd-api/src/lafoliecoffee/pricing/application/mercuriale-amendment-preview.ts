import type {
  CompanyPricingCategoryView,
  MercurialeAmendmentPreviewItem,
  MercurialeAmendmentPreviewRefusal,
  MercurialeAmendmentPreviewSource,
  MercurialeAmendmentPreviewView,
  PricingItemView,
} from "@lfd/contracts";

import type { AppError } from "../../../platform/shared/errors/app-error.js";
import type { CompanyMercuriale } from "../domain/entities/company-mercuriale.js";
import { discountView, policyOf } from "./posed-mercuriale-view.js";

/*
 * Les projections pures de l'aperçu d'un avenant : l'état de référence, les
 * articles avant/après, et un refus du domaine rendu en donnée.
 */

/** La mercuriale à `at`, AVANT l'avenant — ce sur quoi l'écran calcule son écart. */
export function previewState(
  mercuriale: CompanyMercuriale,
  at: Date,
): MercurialeAmendmentPreviewView["state"] {
  return {
    firm: mercuriale.linesAt(at).map((line) => ({
      sku: line.sku,
      tiers: line.tiers.map((tier) => ({
        minQuantity: tier.minQuantity,
        unitPriceMillicents: tier.unitPriceMillicents,
      })),
    })),
    generalDiscount: discountView(mercuriale.generalDiscountAt(at)?.discount ?? null),
    promotionPolicy: policyOf(mercuriale.promotionPolicyAt(at)),
  };
}

/**
 * Les articles, appariés par SKU. La source se lit sur le prix d'APRÈS : la
 * règle de la mercuriale porte l'identifiant du document pour un prix ferme
 * comme pour la remise générale, et c'est la présence d'une ligne ferme à
 * `at` qui les départage — comme le compte de l'onglet « Tarifs ».
 */
export function previewItems(
  before: readonly CompanyPricingCategoryView[],
  after: readonly CompanyPricingCategoryView[],
  mercurialeAfter: CompanyMercuriale,
  at: Date,
): MercurialeAmendmentPreviewItem[] {
  const beforeBySku = new Map(
    before.flatMap((category) => category.items).map((item) => [item.sku, item]),
  );
  const firmSkus = new Set(mercurialeAfter.linesAt(at).map((line) => line.sku));
  return after
    .flatMap((category) => category.items)
    .map((item) => ({
      sku: item.sku,
      beforeMillicents: beforeBySku.get(item.sku)?.finalMillicents ?? item.finalMillicents,
      afterMillicents: item.finalMillicents,
      floored: item.floored,
      source: sourceOf(item, mercurialeAfter.id, firmSkus),
    }));
}

function sourceOf(
  item: PricingItemView,
  mercurialeId: string,
  firmSkus: ReadonlySet<string>,
): MercurialeAmendmentPreviewSource {
  if (item.sealedByRuleId !== mercurialeId) {
    return "chain";
  }
  return firmSkus.has(item.sku) ? "firm" : "general_discount";
}

/** Un refus du domaine, avec l'article qu'il nomme quand il en nomme un. */
export function refusalOf(error: AppError): MercurialeAmendmentPreviewRefusal {
  return {
    code: error.code,
    sku: "sku" in error && typeof error.sku === "string" ? error.sku : null,
    message: error.message,
  };
}
