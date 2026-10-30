import {
  pickupDiscountCovers,
  type AudiencePickupDiscount,
  type PickupDiscountLineFacts,
} from "@lfd/contracts";
import type { SaleUnit } from "@lfd/money";

import type { PriceScope, PricingContext } from "../../../pricing/domain/price-rule.js";
import {
  SCOPE_RANK,
  familyClosenessOf,
  matchesScope,
} from "../../../pricing/domain/specificity.js";
import { promotionScopeMatch, type PromotionScope } from "../promotion-scope.js";
import { repriseScopeOf as pickupDiscountScopeOf } from "./pickup-discount-reprise.fixture.js";

/**
 * **Lot L2 : la portée partagée ne change aucun prix.** Deux égalités, sur
 * une matrice :
 *
 * - la remise de retrait d'aujourd'hui, rebranchée sur la portée des
 *   promotions, couvre exactement ce que couvrait `pickupDiscountCovers` ;
 * - une portée de règle de prix d'étage promotion, traduite comme la reprise
 *   (§ 13.4) la traduira, vise exactement les articles de `matchesScope`, au
 *   rang de `SCOPE_RANK` et à la proximité de `familyClosenessOf`.
 */

const ARTICLES: readonly (PickupDiscountLineFacts & {
  readonly sku: string;
  readonly saleUnit: SaleUnit;
})[] = [
  {
    sku: "SKU-CROISSANT",
    productId: "p_croissant",
    categoryPath: ["c_vienn", "c_boul"],
    saleUnit: "piece",
  },
  { sku: "SKU-PAIN", productId: "p_pain", categoryPath: ["c_pains", "c_boul"], saleUnit: "piece" },
  { sku: "SKU-JUS", productId: "p_jus", categoryPath: ["c_jus"], saleUnit: "piece" },
  { sku: "SKU-COMTE", productId: "p_comte", categoryPath: ["c_cremerie"], saleUnit: "weight" },
  { sku: "SKU-INCONNU", productId: null, categoryPath: [], saleUnit: "piece" },
];

const TEN_PERCENT = { mode: "percent", bp: 1000 } as const;

const PICKUP_DISCOUNTS: readonly AudiencePickupDiscount[] = [
  { adjustment: TEN_PERCENT, scope: "all_except", categories: [], products: [] },
  { adjustment: TEN_PERCENT, scope: "only", categories: [], products: [] },
  {
    adjustment: TEN_PERCENT,
    scope: "all_except",
    categories: [{ categoryId: "c_boul", eligible: false }],
    products: [{ productId: "p_croissant", eligible: true }],
  },
  {
    adjustment: TEN_PERCENT,
    scope: "only",
    categories: [
      { categoryId: "c_boul", eligible: true },
      { categoryId: "c_cremerie", eligible: true },
    ],
    products: [{ productId: "p_pain", eligible: false }],
  },
  {
    adjustment: { mode: "amount", cents: 500 },
    scope: "only",
    categories: [],
    products: [{ productId: "p_jus", eligible: true }],
  },
];

const PRICE_SCOPES: readonly PriceScope[] = [
  { type: "global", id: null },
  { type: "category", id: "c_boul" },
  { type: "category", id: "c_vienn" },
  { type: "category", id: "c_cremerie" },
  { type: "product", id: "SKU-CROISSANT" },
  { type: "product", id: "SKU-COMTE" },
  { type: "variant", id: "SKU-PAIN" },
  { type: "variant", id: "SKU-COMTE" },
];

/** La traduction que la reprise (§ 13.4) écrira en SQL. */
function promotionScopeOfRule(scope: PriceScope): PromotionScope {
  switch (scope.type) {
    case "global":
      return { mode: "all_except", rules: [] };
    case "category":
      return { mode: "only", rules: [ruleOn("category", scope.id, null)] };
    case "product":
      return { mode: "only", rules: [ruleOn("variant", scope.id, 2)] };
    case "variant":
      return { mode: "only", rules: [ruleOn("variant", scope.id, null)] };
  }
}

function ruleOn(target: "category" | "variant", id: string | null, targetRank: number | null) {
  return { target, targetId: id ?? "", eligible: true, targetRank };
}

function pricingContextOf(article: (typeof ARTICLES)[number]): PricingContext {
  return {
    at: new Date(0),
    quantity: 1,
    variantSku: article.sku,
    productSku: article.sku,
    categoryPath: article.categoryPath,
    saleUnit: article.saleUnit,
    companyId: null,
    pricingCompanyId: null,
    segmentId: null,
    cumulativeQuantity: null,
  };
}

describe("la portée partagée reproduit la remise de retrait", () => {
  it.each(PICKUP_DISCOUNTS.map((discount, index) => [index, discount] as const))(
    "remise n° %i : même couverture, article par article",
    (_index, discount) => {
      const scope = pickupDiscountScopeOf(discount);
      for (const article of ARTICLES) {
        const covered = promotionScopeMatch(scope, article, { kind: "basket" }) !== null;
        expect({ sku: article.sku, covered }).toEqual({
          sku: article.sku,
          covered: pickupDiscountCovers(discount, article),
        });
      }
    },
  );
});

describe("la portée partagée reproduit la portée d'une règle de prix", () => {
  it.each(PRICE_SCOPES.map((scope) => [`${scope.type}:${scope.id ?? "-"}`, scope] as const))(
    "%s : mêmes articles visés, même rang, même proximité",
    (_name, priceScope) => {
      const scope = promotionScopeOfRule(priceScope);
      for (const article of ARTICLES) {
        const context = pricingContextOf(article);
        const match = promotionScopeMatch(scope, article, {
          kind: "line",
          saleUnit: article.saleUnit,
        });
        const expected = matchesScope(priceScope, context)
          ? {
              rank: SCOPE_RANK[priceScope.type],
              familyCloseness: familyClosenessOf(priceScope, article.categoryPath),
            }
          : null;
        expect({ sku: article.sku, match }).toEqual({ sku: article.sku, match: expected });
      }
    },
  );
});
