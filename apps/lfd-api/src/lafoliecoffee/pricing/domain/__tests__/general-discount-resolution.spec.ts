import { CompanyMercuriale, type GeneralDiscount } from "../entities/company-mercuriale.js";
import type { PromotionAdmission } from "../entities/mercuriale-promotion-policy.js";
import type { PriceRule, PricingContext } from "../price-rule.js";
import { resolvePrice } from "../resolve-price.js";
import type { VolumeLadder } from "../volume-ladder.js";

/**
 * **La remise générale résolue par la chaîne entière** (`la-remise-generale.md`,
 * D1, D9) : elle s'applique au prix de base, scelle comme un prix ferme, laisse
 * passer les promotions selon la politique du document, et la limite la relève.
 *
 * Les dates sont absolues et ne sont comparées **qu'entre elles** (`AT` est
 * dans les fenêtres) : rien ici ne lit l'horloge (§5 de `CLAUDE.md`).
 */
const AT = new Date("2027-02-01T10:00:00.000Z");
const FROM = new Date("2027-01-01T00:00:00.000Z");
const BASE = 200_000;

const ALL_30: GeneralDiscount = { mode: "all_except", baseBp: 3_000, rules: [] };

function context(over: Partial<PricingContext> = {}): PricingContext {
  return {
    at: AT,
    quantity: 200,
    variantSku: "VIE-001",
    productSku: "VIE-001",
    categoryPath: ["fam-vien"],
    saleUnit: "piece",
    companyId: "cmp_dupont",
    pricingCompanyId: "cmp_dupont",
    segmentId: null,
    cumulativeQuantity: null,
    ...over,
  };
}

function mercuriale(promotionPolicy?: PromotionAdmission): CompanyMercuriale {
  return CompanyMercuriale.pose(
    "merc",
    {
      companyId: "cmp_dupont",
      label: "Mercuriale 2027",
      lines: [],
      validFrom: FROM,
      validTo: null,
      generalDiscount: ALL_30,
      ...(promotionPolicy === undefined ? {} : { promotionPolicy }),
    },
    "auth0|staff",
  );
}

const LADDER: VolumeLadder = {
  id: "ladder",
  scope: { type: "global", id: null },
  audience: { type: "all", id: null },
  unit: "percent",
  tiers: [{ minQuantity: 100, value: 2_000 }],
  label: "Barème volume",
  validFrom: FROM,
  validTo: null,
  suspendedFrom: null,
};

const PROMO: PriceRule = {
  id: "promo",
  stage: "promotion",
  scope: { type: "global", id: null },
  audience: { type: "all", id: null },
  minQuantity: null,
  validFrom: FROM,
  validTo: null,
  suspendedFrom: null,
  label: "Promo de rentrée",
  stacksOverMercuriale: false,
  // Une règle présentée par une promotion porte son rang : c'est ce que la
  // politique de la mercuriale juge (`passesSeal`).
  promotion: { publicRank: 0, fulfillmentRank: 0 },
  nature: "alter",
  alteration: { direction: "decrease", mode: "percent", bp: 1_000 },
};

const NOTHING = { rules: [], ladders: [], promotions: [] } as const;

describe("la remise générale dans la chaîne", () => {
  it("−30 % sur le prix de base", () => {
    const result = resolvePrice(BASE, { ...NOTHING, mercuriale: mercuriale() }, context());

    expect(result.finalMillicents).toBe(140_000);
    expect(result.sealedByRuleId).toBe("merc");
  });

  it("scelle le palier de volume (D1)", () => {
    const result = resolvePrice(
      BASE,
      { ...NOTHING, ladders: [LADDER], mercuriale: mercuriale() },
      context(),
    );

    expect(result.finalMillicents).toBe(140_000);
    expect(result.sealedRuleIds).toContain("ladder");
  });

  it("refuse la promotion quand la politique n'en admet aucune", () => {
    const result = resolvePrice(
      BASE,
      { ...NOTHING, rules: [PROMO], mercuriale: mercuriale() },
      context(),
    );

    expect(result.finalMillicents).toBe(140_000);
  });

  it("admet la promotion quand la politique l'accepte", () => {
    const result = resolvePrice(
      BASE,
      {
        ...NOTHING,
        rules: [PROMO],
        mercuriale: mercuriale({ mode: "selected", promotionIds: ["promo"] }),
      },
      context(),
    );

    expect(result.finalMillicents).toBe(126_000);
  });

  it("la limite relève un −30 % trop profond (D9)", () => {
    const result = resolvePrice(BASE, { ...NOTHING, mercuriale: mercuriale() }, context(), {
      mode: "percent",
      bp: 8_000,
    });

    expect(result.finalMillicents).toBe(160_000);
    expect(result.floored).toBe(true);
  });

  it("un article exclu suit la chaîne normale", () => {
    const excluded = CompanyMercuriale.pose(
      "merc",
      {
        companyId: "cmp_dupont",
        label: "Mercuriale 2027",
        lines: [],
        validFrom: FROM,
        validTo: null,
        generalDiscount: {
          ...ALL_30,
          rules: [{ target: "category", targetId: "fam-vien", bp: null }],
        },
      },
      "auth0|staff",
    );
    const result = resolvePrice(
      BASE,
      { ...NOTHING, ladders: [LADDER], mercuriale: excluded },
      context(),
    );

    expect(result.finalMillicents).toBe(160_000);
    expect(result.sealedByRuleId).toBeNull();
  });
});
