import { admittedPromotion } from "../../../../promotions/domain/__tests__/live-promotion.fixture.js";
import type { AdmittedPromotion } from "../../../../promotions/domain/live-promotion.js";
import { CompanyMercuriale, type MercurialeAmendmentDraft } from "../company-mercuriale.js";
import {
  admissionAt,
  admitsPromotion,
  checkedAdmission,
  NO_PROMOTION_ADMITTED,
  type PromotionAdmission,
} from "../mercuriale-promotion-policy.js";
import { InconsistentPromotionSelectionError } from "../../errors/mercuriale-promotion-policy-errors.js";
import { EmptyAmendmentError } from "../../pricing-errors.js";
import type { PriceRule, PricingContext } from "../../price-rule.js";
import { resolvePrice } from "../../resolve-price.js";

/**
 * **La politique de promotions d'une mercuriale** (`plan-la-mercuriale-decide.md`,
 * § 8, avec la réorientation de Hugo du 2026-10-31 : elle passe par la pose
 * et les avenants datés).
 *
 * Les dates ne sont comparées qu'entre elles et à `NOW`, un instant de la
 * fixture passé en paramètre : aucune n'est confrontée à l'horloge.
 */

const FROM = new Date("2026-01-01T00:00:00.000Z");
const TO = new Date("2026-12-31T00:00:00.000Z");
const NOW = new Date("2026-03-01T00:00:00.000Z");
const APRIL = new Date("2026-04-01T00:00:00.000Z");
const MAY = new Date("2026-05-01T00:00:00.000Z");
const JUNE = new Date("2026-06-01T00:00:00.000Z");

const CANONICAL = 200_000;
const NEGOTIATED = 150_000;
const SELECTED: PromotionAdmission = { mode: "selected", promotionIds: ["promo_a"] };

function posed(promotionPolicy?: PromotionAdmission): CompanyMercuriale {
  return CompanyMercuriale.pose(
    "merc_1",
    {
      companyId: "co_folie",
      label: "Mercuriale 2026",
      lines: [{ sku: "VIE-012", tiers: [{ minQuantity: 1, unitPriceMillicents: NEGOTIATED }] }],
      validFrom: FROM,
      validTo: TO,
      ...(promotionPolicy === undefined ? {} : { promotionPolicy }),
    },
    "staff|marie",
  );
}

function policyOnly(policy: PromotionAdmission, validFrom = APRIL): MercurialeAmendmentDraft {
  return {
    lines: [],
    endedSkus: [],
    validFrom,
    validTo: null,
    reason: "Le client profite désormais des promotions",
    origin: null,
    promotionPolicy: policy,
  };
}

function context(over: Partial<PricingContext> = {}): PricingContext {
  return {
    at: MAY,
    quantity: 1,
    cumulativeQuantity: null,
    variantSku: "VIE-012",
    productSku: "VIE-012",
    categoryPath: ["fam-vien"],
    saleUnit: "piece",
    companyId: "co_folie",
    pricingCompanyId: "co_folie",
    segmentId: null,
    ...over,
  };
}

function promo(id: string, bp = 1_000): AdmittedPromotion {
  return admittedPromotion({
    id,
    label: id,
    validFrom: FROM,
    effect: { kind: "percent_off", basisPoints: bp },
    scope: { mode: "all_except", rules: [] },
  });
}

function priced(
  mercuriale: CompanyMercuriale,
  promotions: readonly AdmittedPromotion[],
  ctx: PricingContext = context(),
  rules: readonly PriceRule[] = [],
) {
  return resolvePrice(CANONICAL, { rules, ladders: [], mercuriale, promotions }, ctx);
}

describe("la politique, en forme canonique", () => {
  it("trie et dédoublonne la liste « Au choix »", () => {
    expect(checkedAdmission({ mode: "selected", promotionIds: ["b", "a", "b"] })).toEqual({
      mode: "selected",
      promotionIds: ["a", "b"],
    });
  });

  it("refuse « Au choix » vide, et une liste hors « Au choix »", () => {
    expect(() => checkedAdmission({ mode: "selected", promotionIds: [] })).toThrow(
      InconsistentPromotionSelectionError,
    );
    expect(() => checkedAdmission({ mode: "all", promotionIds: ["a"] })).toThrow(
      InconsistentPromotionSelectionError,
    );
  });

  it("aucune / toutes / au choix", () => {
    expect(admitsPromotion(NO_PROMOTION_ADMITTED, "promo_a")).toBe(false);
    expect(admitsPromotion({ mode: "all", promotionIds: [] }, "promo_a")).toBe(true);
    expect(admitsPromotion(SELECTED, "promo_a")).toBe(true);
    expect(admitsPromotion(SELECTED, "promo_b")).toBe(false);
  });
});

describe("la politique datée : la pose, puis les avenants", () => {
  it("une mercuriale neuve démarre en « Aucune »", () => {
    expect(posed().promotionPolicyAt(MAY)).toEqual(NO_PROMOTION_ADMITTED);
  });

  it("la pose fixe la politique de départ, canonique", () => {
    const mercuriale = posed({ mode: "selected", promotionIds: ["promo_b", "promo_a"] });
    expect(mercuriale.promotionPolicyAt(FROM)).toEqual({
      mode: "selected",
      promotionIds: ["promo_a", "promo_b"],
    });
  });

  it("un avenant qui ne change que la politique est valide, et agit à sa date d'effet", () => {
    const amended = posed().amend("amd_1", policyOnly({ mode: "all", promotionIds: [] }), "p", NOW);
    expect(amended.promotionPolicyAt(new Date(APRIL.getTime() - 1))).toEqual(NO_PROMOTION_ADMITTED);
    expect(amended.promotionPolicyAt(APRIL)).toEqual({ mode: "all", promotionIds: [] });
  });

  it("un avenant vide — ni ligne, ni arrêt, ni politique — reste refusé", () => {
    expect(() =>
      posed().amend("amd_1", { ...policyOnly(SELECTED), promotionPolicy: null }, "p", NOW),
    ).toThrow(EmptyAmendmentError);
  });

  it("un avenant refuse une politique incohérente", () => {
    expect(() =>
      posed().amend("amd_1", policyOnly({ mode: "selected", promotionIds: [] }), "p", NOW),
    ).toThrow(InconsistentPromotionSelectionError);
  });

  it("le dernier avenant qui en porte une l'emporte ; un avenant sans politique n'y touche pas", () => {
    const amended = posed()
      .amend("amd_1", policyOnly({ mode: "all", promotionIds: [] }), "p", NOW)
      .amend("amd_2", policyOnly(SELECTED, JUNE), "p", NOW)
      .amend(
        "amd_3",
        {
          ...policyOnly(SELECTED, JUNE),
          promotionPolicy: null,
          lines: [{ sku: "PAI-001", tiers: [{ minQuantity: 1, unitPriceMillicents: 90_000 }] }],
        },
        "p",
        NOW,
      );
    expect(amended.promotionPolicyAt(MAY)).toEqual({ mode: "all", promotionIds: [] });
    expect(amended.promotionPolicyAt(JUNE)).toEqual(SELECTED);
  });

  it("à date égale, le dernier écrit l'emporte", () => {
    const amended = posed()
      .amend("amd_1", policyOnly({ mode: "all", promotionIds: [] }), "p", NOW)
      .amend("amd_2", policyOnly(SELECTED), "p", NOW);
    expect(amended.promotionPolicyAt(APRIL)).toEqual(SELECTED);
  });

  it("un avenant rangé avant l'instant lu ne compte plus ; rangé après, il compte", () => {
    const grid = {
      promotionPolicy: NO_PROMOTION_ADMITTED,
      amendments: [{ validFrom: APRIL, archivedAt: JUNE, promotionPolicy: SELECTED }],
    };
    expect(admissionAt(grid, MAY)).toEqual(SELECTED);
    expect(admissionAt(grid, new Date(JUNE.getTime() + 1))).toEqual(NO_PROMOTION_ADMITTED);
  });
});

describe("le prix affiché lit la politique de la mercuriale qui scelle", () => {
  it("« Aucune » : pas de promotion sur l'article négocié, scellée et consignée", () => {
    const result = priced(posed(), [promo("promo_a")]);
    expect(result.finalMillicents).toBe(NEGOTIATED);
    expect(result.sealedRuleIds).toEqual(["promo_a"]);
    expect(result.sealingAdmission).toEqual(NO_PROMOTION_ADMITTED);
  });

  it("« Aucune » : un article que la mercuriale ne fixe pas reçoit la promotion", () => {
    const result = priced(
      posed(),
      [promo("promo_a")],
      context({ variantSku: "PAI-001", productSku: "PAI-001" }),
    );
    expect(result.finalMillicents).toBe(180_000);
    expect(result.sealedByRuleId).toBeNull();
    expect(result.sealingAdmission).toBeNull();
  });

  it("« Toutes » : la promotion s'applique au prix négocié", () => {
    const result = priced(posed({ mode: "all", promotionIds: [] }), [promo("promo_a")]);
    expect(result.finalMillicents).toBe(135_000);
    expect(result.sealedByRuleId).toBe("merc_1");
  });

  it("« Au choix » : seule la promotion choisie passe", () => {
    const result = priced(posed(SELECTED), [promo("promo_a", 1_000), promo("promo_b", 5_000)]);
    // promo_b, plus avantageuse, gagne l'étage puis est scellée : l'étage est
    // transparent (le gagnant se désigne d'abord, cf. `resolvePrice`).
    expect(result.sealedRuleIds).toEqual(["promo_b"]);
    expect(priced(posed(SELECTED), [promo("promo_a")]).finalMillicents).toBe(135_000);
  });

  it("une règle de prix ORDINAIRE garde `stacksOverMercuriale`, quelle que soit la politique", () => {
    const ordinary: PriceRule = {
      id: "geste",
      stage: "geste",
      scope: { type: "global", id: null },
      audience: { type: "all", id: null },
      minQuantity: null,
      validFrom: FROM,
      validTo: null,
      suspendedFrom: null,
      label: "Geste",
      stacksOverMercuriale: true,
      nature: "alter",
      alteration: { direction: "decrease", mode: "percent", bp: 1_000 },
    };
    expect(priced(posed(), [], context(), [ordinary]).finalMillicents).toBe(135_000);
    expect(
      priced(posed(), [], context(), [{ ...ordinary, stacksOverMercuriale: false }])
        .finalMillicents,
    ).toBe(NEGOTIATED);
  });

  it("un site paie la mercuriale de son principal, et en suit la politique", () => {
    const site = context({ companyId: "co_site", pricingCompanyId: "co_folie" });
    expect(
      priced(posed({ mode: "all", promotionIds: [] }), [promo("promo_a")], site).finalMillicents,
    ).toBe(135_000);
    expect(priced(posed(), [promo("promo_a")], site).finalMillicents).toBe(NEGOTIATED);
  });

  it("une lecture datée d'avant l'avenant lit la politique d'alors, pas celle d'aujourd'hui", () => {
    const amended = posed().amend(
      "amd_1",
      policyOnly({ mode: "all", promotionIds: [] }, JUNE),
      "p",
      NOW,
    );
    expect(priced(amended, [promo("promo_a")], context({ at: MAY })).finalMillicents).toBe(
      NEGOTIATED,
    );
    expect(priced(amended, [promo("promo_a")], context({ at: JUNE })).finalMillicents).toBe(
      135_000,
    );
  });
});
