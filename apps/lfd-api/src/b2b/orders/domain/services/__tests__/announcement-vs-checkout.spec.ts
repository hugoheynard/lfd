import { discountCentsOf } from "@lfd/contracts";

import {
  livePromotion,
  ASKED_AT,
  type LivePromotionOverrides,
} from "../../../../promotions/domain/__tests__/live-promotion.fixture.js";
import {
  promotionsAdmitted,
  type LivePromotion,
} from "../../../../promotions/domain/live-promotion.js";
import { announcedPickupDiscounts } from "../../../../promotions/domain/pickup-discount-announcement.js";
import { signInOfferFor } from "../../../../promotions/domain/promotion-offers.js";
import { promotionScopeCovers } from "../../../../promotions/domain/promotion-scope.js";
import type { PromotionAudienceFacts } from "../../../../promotions/domain/promotion-targeting.js";
import { promotionAsRule } from "../../../../pricing/domain/promotion-as-rule.js";
import type { PricingContext } from "../../../../pricing/domain/price-rule.js";
import { resolvePrice } from "../../../../pricing/domain/resolve-price.js";
import type { OrderLineClassification } from "../../ports/order-line-classification.reader.js";
import { chooseBasketPromotion } from "../basket-promotion-choice.js";

/**
 * **Ce que la boutique annonce n'est jamais PLUS que ce que la caisse retire**
 * (sous-annonce acceptable, sur-annonce = bug). Deux annonceurs — la remise
 * de retrait d'un point (`announcedPickupDiscounts`) et l'offre « connectez-
 * vous » (`signInOfferFor`) — contre une caisse : `promotionsAdmitted` puis
 * `chooseBasketPromotion` au panier, `resolvePrice` à la ligne.
 *
 * Les scénarios respectent ce que l'écran refuse déjà : deux promotions
 * panier NON cumulables ne se chevauchent pas, sauf par une cumulable.
 */

const PICKUP = "pk_1";
const BREAD = { productId: "p_pain", categoryId: "c_pains", categoryPath: ["c_pains"] };
const CLASSES: ReadonlyMap<string, OrderLineClassification> = new Map([
  ["PAI-001", { ...BREAD, madeToOrder: false }],
  ["BOI-001", { productId: "p_jus", categoryId: "c_b", categoryPath: ["c_b"], madeToOrder: false }],
]);
const LINES = [
  { sku: "PAI-001", htCents: 4_000, quantity: 4 },
  { sku: "BOI-001", htCents: 1_000, quantity: 1 },
];
const FULFILLMENT = { method: "pickup", pickupId: PICKUP } as const;

const INDIVIDUAL = (buyerKind: "guest" | "registered"): PromotionAudienceFacts => ({
  companyId: null,
  companyStatus: null,
  principal: { companyId: null },
  buyerKind,
  fulfillment: FULFILLMENT,
});
const COMPANY = (status: "active" | "pending"): PromotionAudienceFacts => ({
  companyId: "co_1",
  companyStatus: status,
  principal: { companyId: "co_1" },
  buyerKind: "registered",
  fulfillment: FULFILLMENT,
});

/** Un panier-promotion : retrait, `pickup` par défaut. */
function basket(over: LivePromotionOverrides): LivePromotion {
  return livePromotion({ fulfillment: { kind: "pickup" }, ...over });
}

function checkoutCents(promotions: readonly LivePromotion[], facts: PromotionAudienceFacts) {
  const admitted = promotionsAdmitted(
    promotions.filter((promotion) => promotion.fulfillment.kind !== "any"),
    ASKED_AT,
    facts,
  );
  return chooseBasketPromotion(admitted, LINES, CLASSES).discountCents;
}

/** Ce que l'annonce de la clientèle vaudrait sur CE panier, bornée comme la caisse. */
function announcedCents(
  promotions: readonly LivePromotion[],
  clientele: "b2b" | "b2c",
): number | null {
  const announced = announcedPickupDiscounts(promotions, PICKUP, ASKED_AT)[clientele];
  if (announced === null) {
    return null;
  }
  const rules = [
    ...announced.categories.map((entry) => ({
      target: "category" as const,
      targetId: entry.categoryId,
      eligible: entry.eligible,
      targetRank: null,
    })),
    ...announced.products.map((entry) => ({
      target: "product" as const,
      targetId: entry.productId,
      eligible: entry.eligible,
      targetRank: null,
    })),
  ];
  const base = LINES.filter((line) => {
    const known = CLASSES.get(line.sku);
    return promotionScopeCovers(
      { mode: announced.scope, rules },
      {
        sku: line.sku,
        productId: known?.productId ?? null,
        categoryPath: known?.categoryPath ?? [],
      },
      { kind: "basket" },
    );
  }).reduce((sum, line) => sum + line.htCents, 0);
  return discountCentsOf(announced.adjustment, base);
}

describe("l'annonce d'un point de retrait ne dépasse pas la caisse", () => {
  const cases: ReadonlyArray<{
    readonly name: string;
    readonly promotions: readonly LivePromotion[];
  }> = [
    {
      // Le rang prime sur l'avantage : 5 % `individuals` est annoncé, mais la
      // cumulable 20 % « tout le monde » le recouvre — la caisse retient le plan le plus fort.
      name: "public plus spécifique mais moins généreux, recouvert par une cumulable",
      promotions: [
        basket({
          id: "a_ind",
          audience: { kind: "individuals" },
          effect: { kind: "percent_off", basisPoints: 500 },
        }),
        basket({
          id: "b_all",
          cumulative: true,
          effect: { kind: "percent_off", basisPoints: 2000 },
        }),
      ],
    },
    {
      name: "inscrits cumulable contre tout le monde cumulable",
      promotions: [
        basket({
          id: "a_reg",
          cumulative: true,
          audience: { kind: "individuals_registered" },
          effect: { kind: "percent_off", basisPoints: 500 },
        }),
        basket({
          id: "b_all",
          cumulative: true,
          effect: { kind: "percent_off", basisPoints: 2000 },
        }),
      ],
    },
    {
      // « ce point » (rang 2) l'emporte sur « tout retrait » (rang 1) à l'annonce.
      name: "ce point contre tout retrait, pourcentage et montant, cumulables",
      promotions: [
        basket({
          id: "a_point",
          cumulative: true,
          fulfillment: { kind: "pickup_point", pickupId: PICKUP },
          effect: { kind: "basket_amount_off", cents: 300 },
        }),
        basket({
          id: "b_mode",
          cumulative: true,
          effect: { kind: "percent_off", basisPoints: 1500 },
        }),
      ],
    },
    {
      // Montant plus grand que le panier : l'annonce est bornée comme la caisse.
      name: "montant supérieur au panier",
      promotions: [basket({ id: "a_big", effect: { kind: "basket_amount_off", cents: 99_999 } })],
    },
    {
      // Deux non cumulables disjointes : la caisse retient les deux, l'annonce une.
      name: "deux non cumulables sur des familles disjointes",
      promotions: [
        basket({
          id: "a_pain",
          audience: { kind: "pros_active" },
          scope: {
            mode: "only",
            rules: [{ target: "category", targetId: "c_pains", eligible: true, targetRank: null }],
          },
          effect: { kind: "percent_off", basisPoints: 1000 },
        }),
        basket({
          id: "b_bois",
          scope: {
            mode: "only",
            rules: [{ target: "category", targetId: "c_b", eligible: true, targetRank: null }],
          },
          effect: { kind: "percent_off", basisPoints: 3000 },
        }),
      ],
    },
    {
      // Une condition de quantité n'est pas annoncée ; la moins spécifique
      // sans condition n'est pas annoncée à sa place (sous-annonce).
      name: "gagnante conditionnée",
      promotions: [
        basket({
          id: "a_cond",
          audience: { kind: "individuals" },
          conditions: [{ kind: "min_quantity", value: 50 }],
          effect: { kind: "percent_off", basisPoints: 2000 },
        }),
        basket({ id: "b_all", effect: { kind: "percent_off", basisPoints: 500 } }),
      ],
    },
  ];

  for (const { name, promotions } of cases) {
    it(`b2b : ${name}`, () => {
      const announced = announcedCents(promotions, "b2b");
      expect(checkoutCents(promotions, COMPANY("active"))).toBeGreaterThanOrEqual(announced ?? 0);
    });
    it(`b2c : ${name}`, () => {
      const announced = announcedCents(promotions, "b2c");
      for (const kind of ["guest", "registered"] as const) {
        expect(checkoutCents(promotions, INDIVIDUAL(kind))).toBeGreaterThanOrEqual(announced ?? 0);
      }
    });
  }
});

describe("l'offre « connectez-vous » ne dépasse pas ce que l'inscrit se voit retirer", () => {
  const OFFERED = [
    {
      article: { sku: "PAI-001", productId: "p_pain", categoryPath: ["c_pains"] },
      point: { kind: "line", saleUnit: "piece" },
      quantity: 4,
    },
    {
      article: { sku: "BOI-001", productId: "p_jus", categoryPath: ["c_b"] },
      point: { kind: "line", saleUnit: "piece" },
      quantity: 1,
    },
  ] as const;

  function offeredBp(promotions: readonly LivePromotion[]): number | null {
    const offer = signInOfferFor(promotions, ASKED_AT, OFFERED, FULFILLMENT);
    return offer?.effect?.kind === "percent" ? offer.effect.basisPoints : null;
  }

  it("panier : la plus forte offre est retirée en entier, même recouverte par une moins forte plus spécifique", () => {
    const promotions = [
      basket({
        id: "a_strong",
        audience: { kind: "individuals_registered" },
        effect: { kind: "percent_off", basisPoints: 2000 },
      }),
      basket({
        id: "b_point",
        cumulative: true,
        audience: { kind: "individuals_registered" },
        fulfillment: { kind: "pickup_point", pickupId: PICKUP },
        effect: { kind: "percent_off", basisPoints: 500 },
      }),
    ];
    const bp = offeredBp(promotions) ?? 0;
    expect(bp).toBe(2000);
    expect(checkoutCents(promotions, INDIVIDUAL("registered"))).toBeGreaterThanOrEqual(
      discountCentsOf({ mode: "percent", bp }, 5_000),
    );
  });

  it("panier : une quantité minimum atteinte par une ligne seulement ne promet que sur cette ligne", () => {
    const promotions = [
      basket({
        id: "a_min",
        audience: { kind: "individuals_registered" },
        conditions: [{ kind: "min_quantity", value: 4 }],
        effect: { kind: "percent_off", basisPoints: 1000 },
      }),
    ];
    expect(offeredBp(promotions)).toBe(1000);
    // La caisse ne retire que sur la ligne qui atteint le seuil (4 000 c).
    expect(checkoutCents(promotions, INDIVIDUAL("registered"))).toBeGreaterThan(0);
  });

  // Au point LIGNE, deux non cumulables qui se croisent sont refusées à la pose
  // (`OverlappingPromotionError`) : le cas qui reste est la cumulable, que la
  // chaîne applique en entier — l'offre « −20 % » n'est pas rognée par la
  // famille plus spécifique à −5 %.
  it("ligne : l'offre la plus forte n'est pas rognée par une cumulable de famille plus spécifique", () => {
    const promotions = [
      livePromotion({
        id: "a_global",
        cumulative: true,
        audience: { kind: "individuals_registered" },
        effect: { kind: "percent_off", basisPoints: 2000 },
      }),
      livePromotion({
        id: "b_family",
        cumulative: true,
        audience: { kind: "individuals_registered" },
        scope: {
          mode: "only",
          rules: [{ target: "category", targetId: "c_pains", eligible: true, targetRank: null }],
        },
        effect: { kind: "percent_off", basisPoints: 500 },
      }),
    ];
    const bp = offeredBp(promotions) ?? 0;
    const context: PricingContext = {
      at: ASKED_AT,
      quantity: 4,
      variantSku: "PAI-001",
      productSku: "PAI-001",
      categoryPath: ["c_pains"],
      saleUnit: "piece",
      companyId: null,
      pricingCompanyId: null,
      segmentId: null,
      cumulativeQuantity: null,
    };
    const admitted = promotionsAdmitted(promotions, ASKED_AT, INDIVIDUAL("registered"));
    const priced = resolvePrice(
      100_000,
      { rules: [], ladders: [], mercuriale: null, promotions: admitted },
      context,
    );
    expect(admitted.map((promotion) => promotionAsRule(promotion, context)?.id)).toContain(
      "b_family",
    );
    expect(100_000 - priced.finalMillicents).toBeGreaterThanOrEqual((100_000 * bp) / 10_000);
  });
});
