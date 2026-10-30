import { catalogueArticle } from "../../../catalog/domain/catalogue-article.js";
import { RecordingShadowJournal } from "../../../promotions/application/__tests__/promotion-supply.doubles.js";
import { admittedPromotion } from "../../../promotions/domain/__tests__/live-promotion.fixture.js";
import type { AdmittedPromotion } from "../../../promotions/domain/live-promotion.js";
import { LoadedPricer } from "../../domain/loaded-pricer.js";
import type { PriceRule } from "../../domain/price-rule.js";
import { materialsOf, NO_EVIDENCE } from "../../domain/pricing-materials.js";
import { PricedLot } from "../priced-lot.js";

/**
 * **Le mode ombre au point ligne** (plan des promotions, § 13.5 et § 13.11,
 * lot L5) : le prix servi est celui de l'ancien chemin, toujours ; le prix
 * des promotions est calculé à côté, et tout écart est consigné.
 */

const AT = new Date("2026-11-15T09:00:00.000Z");
const FROM = new Date("2026-11-01T00:00:00.000Z");

const CROISSANT = catalogueArticle({
  sku: "VIE-001",
  name: "Croissant au beurre",
  categoryPath: ["fam-vien"],
  unitPriceMillicents: 200_000,
  saleUnit: "piece",
});

const RULE: PriceRule = {
  id: "promo_1",
  stage: "promotion",
  scope: { type: "global", id: null },
  audience: { type: "all", id: null },
  minQuantity: null,
  label: "−20 % sur tout",
  stacksOverMercuriale: false,
  nature: "alter",
  alteration: { direction: "decrease", mode: "percent", bp: 2_000 },
  validFrom: FROM,
  validTo: null,
  suspendedFrom: null,
};

function pricer(
  rules: readonly PriceRule[],
  promotions: readonly AdmittedPromotion[],
): LoadedPricer {
  return LoadedPricer.over(
    materialsOf({ rules, floors: [], ladders: [], commitments: [], mercuriale: null, promotions }),
    NO_EVIDENCE,
    { companyId: null, pricingCompanyId: null, buyerKind: "unknown" },
    AT,
  );
}

function shadowLot(promotions: readonly AdmittedPromotion[]) {
  const journal = new RecordingShadowJournal();
  const lot = new PricedLot(pricer([RULE], []), [CROISSANT], {
    pricer: pricer([], promotions),
    journal,
  });
  return { lot, journal };
}

describe("PricedLot sous l'ombre", () => {
  it("ne consigne rien quand la promotion reprise dit la même chose", () => {
    const { lot, journal } = shadowLot([admittedPromotion({ validFrom: FROM })]);

    expect(lot.price("VIE-001", 3).finalMillicents).toBe(160_000);
    expect(journal.entries).toEqual([]);
  });

  it("sert l'ancien prix et consigne l'écart, sans donnée personnelle", () => {
    const { lot, journal } = shadowLot([
      admittedPromotion({
        id: "promo_30",
        validFrom: FROM,
        effect: { kind: "percent_off", basisPoints: 3_000 },
      }),
    ]);

    expect(lot.price("VIE-001", 2).finalMillicents).toBe(160_000);
    expect(journal.entries).toEqual([
      {
        point: "line",
        sku: "VIE-001",
        quantity: 2,
        servedMillicents: 160_000,
        shadowMillicents: 140_000,
        servedRuleId: "promo_1",
        shadowRuleId: "promo_30",
      },
    ]);
  });

  it("consigne un écart de règle même à prix égal", () => {
    const { lot, journal } = shadowLot([admittedPromotion({ id: "autre", validFrom: FROM })]);

    lot.price("VIE-001", 1);

    expect(journal.entries).toHaveLength(1);
  });

  it("sans ombre, rien n'est calculé à côté", () => {
    const lot = new PricedLot(pricer([RULE], []), [CROISSANT]);
    expect(lot.price("VIE-001", 1).finalMillicents).toBe(160_000);
  });
});
