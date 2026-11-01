import {
  ASKED_AT,
  livePromotion,
} from "../../../promotions/domain/__tests__/live-promotion.fixture.js";
import { promotionDecimalNets, type ProPricedArticle } from "../promotion-decimals.js";

function article(sku: string, priceMillicents: number): ProPricedArticle {
  return {
    sku,
    productSku: sku,
    name: sku,
    categoryPath: ["c_viennoiserie"],
    saleUnit: "piece",
    priceMillicents,
  };
}

const AT_93 = article("CRO-1", 93_000);
const AT_100 = article("PAI-1", 100_000);

describe("promotionDecimalNets — l'avertissement des décimales (§ 18.7)", () => {
  it("compte 0,93 € à −12 % : le net vaut 0,8184 €", () => {
    const nets = promotionDecimalNets(
      livePromotion({ effect: { kind: "percent_off", basisPoints: 1200 } }),
      [AT_93],
      ASKED_AT,
    );
    expect(nets).toEqual([{ article: AT_93, netMillicents: 81_840 }]);
  });

  it("ne compte pas 1,00 € à −20 % : le net tombe au centime", () => {
    const nets = promotionDecimalNets(livePromotion(), [AT_100], ASKED_AT);
    expect(nets).toEqual([]);
  });

  it("ne compte jamais une remise en montant fixe", () => {
    const nets = promotionDecimalNets(
      livePromotion({ effect: { kind: "unit_amount_off", millicents: 12_000 } }),
      [AT_93, AT_100],
      ASKED_AT,
    );
    expect(nets).toEqual([]);
  });

  it("ne compte pas un article hors de la portée", () => {
    const nets = promotionDecimalNets(
      livePromotion({
        effect: { kind: "percent_off", basisPoints: 1200 },
        scope: {
          mode: "all_except",
          rules: [{ target: "variant", targetId: "CRO-1", eligible: false, targetRank: null }],
        },
      }),
      [AT_93],
      ASKED_AT,
    );
    expect(nets).toEqual([]);
  });

  it("ne compte rien pour une remise de panier en pourcentage", () => {
    const nets = promotionDecimalNets(
      livePromotion({
        effect: { kind: "percent_off", basisPoints: 1200 },
        fulfillment: { kind: "basket", pickup: "all", delivery: "none" },
      }),
      [AT_93],
      ASKED_AT,
    );
    expect(nets).toEqual([]);
  });
});
