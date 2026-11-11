import {
  CompanyMercuriale,
  type CompanyMercurialeDraft,
  type GeneralDiscount,
  type GeneralDiscountRule,
} from "../company-mercuriale.js";
import type { PriceRule, PricingContext } from "../../price-rule.js";
import {
  EmptyAmendmentError,
  DuplicateGeneralDiscountTargetError,
  EmptyMercurialeError,
  GeneralDiscountBaseRateError,
  GeneralDiscountIncludesNothingError,
  InvalidGeneralDiscountError,
} from "../../pricing-errors.js";

/**
 * **La remise générale d'une mercuriale** — « tout le reste à −30 %, sauf… »
 * (`plan-remise-generale.md`, lot R1).
 *
 * Les dates sont absolues et ne sont comparées **qu'entre elles** : l'instant
 * du contexte et le `now` de l'avenant sont passés en paramètre, rien ne lit
 * l'horloge (exception écrite au §5 de `CLAUDE.md`).
 */
const FROM = new Date("2027-01-01T00:00:00.000Z");
const TO = new Date("2027-12-31T00:00:00.000Z");
const MARCH = new Date("2027-03-01T00:00:00.000Z");
const MARCH_10 = new Date("2027-03-10T00:00:00.000Z");
const APRIL = new Date("2027-04-01T00:00:00.000Z");
const APRIL_10 = new Date("2027-04-10T00:00:00.000Z");
const FEBRUARY = new Date("2027-02-01T00:00:00.000Z");

function rule(
  target: GeneralDiscountRule["target"],
  targetId: string,
  bp: number | null,
): GeneralDiscountRule {
  return { target, targetId, bp };
}

const ALL_30: GeneralDiscount = { mode: "all_except", baseBp: 3_000, rules: [] };

const allExcept = (...rules: GeneralDiscountRule[]): GeneralDiscount => ({ ...ALL_30, rules });
const only = (...rules: GeneralDiscountRule[]): GeneralDiscount => ({
  mode: "only",
  baseBp: null,
  rules,
});

function draft(over: Partial<CompanyMercurialeDraft> = {}): CompanyMercurialeDraft {
  return {
    companyId: "cmp_dupont",
    label: "Mercuriale 2027",
    lines: [],
    validFrom: FROM,
    validTo: TO,
    generalDiscount: ALL_30,
    ...over,
  };
}

const pose = (over: Partial<CompanyMercurialeDraft> = {}): CompanyMercuriale =>
  CompanyMercuriale.pose("merc", draft(over), "auth0|staff");

function context(over: Partial<PricingContext> = {}): PricingContext {
  return {
    at: FEBRUARY,
    quantity: 1,
    variantSku: "VIE-001",
    productSku: "VIE-001",
    categoryPath: ["fam-vien", "fam-boul"],
    saleUnit: "piece",
    companyId: "cmp_dupont",
    pricingCompanyId: "cmp_dupont",
    segmentId: null,
    cumulativeQuantity: null,
    ...over,
  };
}

/** Le pourcentage d'une règle `alter`, ou `null` — affiné plutôt que casté. */
function discountBp(found: PriceRule | null): number | null {
  if (found === null || found.nature !== "alter" || found.alteration.mode !== "percent") {
    return null;
  }
  return found.alteration.bp;
}

describe("poser une remise générale", () => {
  it("admet une mercuriale sans prix ferme qui porte une remise générale (D5)", () => {
    const posed = pose();

    expect(posed.lines).toEqual([]);
    expect(posed.generalDiscount).toEqual(ALL_30);
  });

  it("refuse une mercuriale sans prix ferme ni remise générale", () => {
    expect(() => pose({ generalDiscount: null })).toThrow(EmptyMercurialeError);
  });

  it.each([0, 10_000, -5, 12.5])("refuse un taux de base de %s points de base", (bp) => {
    expect(() => pose({ generalDiscount: { ...ALL_30, baseBp: bp } })).toThrow(
      InvalidGeneralDiscountError,
    );
  });

  it("refuse un taux de ligne hors bornes", () => {
    expect(() => pose({ generalDiscount: allExcept(rule("category", "fam-pain", 0)) })).toThrow(
      InvalidGeneralDiscountError,
    );
  });

  it("admet les bornes 0,01 % et 99,99 %", () => {
    expect(() => pose({ generalDiscount: { ...ALL_30, baseBp: 1 } })).not.toThrow();
    expect(() => pose({ generalDiscount: { ...ALL_30, baseBp: 9_999 } })).not.toThrow();
  });

  it("refuse « tout sauf » sans taux de base, et « seulement » avec", () => {
    expect(() => pose({ generalDiscount: { ...ALL_30, baseBp: null } })).toThrow(
      GeneralDiscountBaseRateError,
    );
    expect(() =>
      pose({ generalDiscount: { ...only(rule("category", "fam-pain", 2_000)), baseBp: 3_000 } }),
    ).toThrow(GeneralDiscountBaseRateError);
  });

  it("refuse « seulement » sans aucune ligne à taux", () => {
    expect(() => pose({ generalDiscount: only(rule("category", "fam-choc", null)) })).toThrow(
      GeneralDiscountIncludesNothingError,
    );
  });

  it("refuse deux lignes sur la même cible", () => {
    const twice = allExcept(
      rule("category", "fam-pain", 4_000),
      rule("category", "fam-pain", null),
    );

    expect(() => pose({ generalDiscount: twice })).toThrow(DuplicateGeneralDiscountTargetError);
  });
});

/** Le pain spécial : sous-famille de Pains, elle-même sous Boulangerie. */
const SPECIAL_BREAD = context({
  variantSku: "PAI-SPE",
  productSku: "PAI-SPE",
  categoryPath: ["fam-pain-spe", "fam-pain", "fam-boul"],
});
const TRADITION = context({
  variantSku: "PAI-TRA",
  productSku: "PAI-TRA",
  categoryPath: ["fam-pain", "fam-boul"],
});

describe("le taux qui s'applique : la décision la plus précise", () => {
  it("−40 % sur la famille Pains, −30 % sur le reste", () => {
    const posed = pose({ generalDiscount: allExcept(rule("category", "fam-pain", 4_000)) });

    expect(discountBp(posed.asRuleFor(TRADITION))).toBe(4_000);
    expect(discountBp(posed.asRuleFor(context()))).toBe(3_000);
  });

  it("une sous-famille à −25 % sous une famille à −40 %", () => {
    const posed = pose({
      generalDiscount: allExcept(
        rule("category", "fam-pain", 4_000),
        rule("category", "fam-pain-spe", 2_500),
      ),
    });

    expect(discountBp(posed.asRuleFor(SPECIAL_BREAD))).toBe(2_500);
    expect(discountBp(posed.asRuleFor(TRADITION))).toBe(4_000);
  });

  it("une déclinaison à −35 % dans une famille à −40 %", () => {
    const posed = pose({
      generalDiscount: allExcept(
        rule("category", "fam-pain", 4_000),
        rule("variant", "PAI-TRA", 3_500),
      ),
    });

    expect(discountBp(posed.asRuleFor(TRADITION))).toBe(3_500);
    expect(discountBp(posed.asRuleFor(SPECIAL_BREAD))).toBe(4_000);
  });

  it("tout sauf la famille Chocolat", () => {
    const posed = pose({ generalDiscount: allExcept(rule("category", "fam-choc", null)) });

    expect(discountBp(posed.asRuleFor(context()))).toBe(3_000);
    expect(posed.asRuleFor(context({ categoryPath: ["fam-choc"] }))).toBeNull();
  });

  it("une déclinaison réincluse, avec son taux, dans une famille exclue", () => {
    const posed = pose({
      generalDiscount: allExcept(
        rule("category", "fam-vien", null),
        rule("variant", "VIE-001", 1_500),
      ),
    });

    expect(discountBp(posed.asRuleFor(context()))).toBe(1_500);
    expect(posed.asRuleFor(context({ variantSku: "VIE-002", productSku: "VIE-002" }))).toBeNull();
  });

  it("« seulement » : une famille à −20 %, le reste au prix normal", () => {
    const posed = pose({ generalDiscount: only(rule("category", "fam-vien", 2_000)) });

    expect(discountBp(posed.asRuleFor(context()))).toBe(2_000);
    expect(posed.asRuleFor(TRADITION)).toBeNull();
  });

  it("couvre un article au poids par le mode ou la famille (D4)", () => {
    const found = pose().asRuleFor(context({ saleUnit: "weight", quantity: 250 }));

    expect(discountBp(found)).toBe(3_000);
  });

  it("rend la règle d'étage annoncée par le plan", () => {
    expect(pose().asRuleFor(context())).toEqual({
      id: "merc",
      stage: "mercuriale",
      scope: { type: "product", id: "VIE-001" },
      audience: { type: "company", id: "cmp_dupont" },
      minQuantity: null,
      validFrom: FROM,
      validTo: TO,
      suspendedFrom: null,
      label: "Mercuriale 2027 — remise générale −30 %",
      stacksOverMercuriale: false,
      promotionAdmission: { mode: "none", promotionIds: [] },
      nature: "alter",
      alteration: { direction: "decrease", mode: "percent", bp: 3_000 },
    });
  });

  it("le libellé dit le taux appliqué, à la française", () => {
    const posed = pose({ generalDiscount: allExcept(rule("category", "fam-pain", 1_250)) });

    expect(posed.asRuleFor(TRADITION)?.label).toBe("Mercuriale 2027 — remise générale −12,5 %");
  });

  it("ne parle pas pour un autre compte de tarif", () => {
    expect(pose().asRuleFor(context({ pricingCompanyId: "cmp_autre" }))).toBeNull();
  });
});

describe("le prix ferme d'abord (D2)", () => {
  const firm = [{ sku: "VIE-001", tiers: [{ minQuantity: 50, unitPriceMillicents: 150_000 }] }];

  it("le prix ferme l'emporte sur la remise générale", () => {
    const found = pose({ lines: firm }).asRuleFor(context({ quantity: 60 }));

    expect(found).toMatchObject({ nature: "replace", amountMillicents: 150_000 });
  });

  it("palier non atteint : ni prix ferme ni remise, et « palier non atteint » reste dit", () => {
    const posed = pose({ lines: firm });

    expect(posed.asRuleFor(context({ quantity: 10 }))).toBeNull();
    expect(posed.missesTierFor(context({ quantity: 10 }))).toBe(true);
  });

  it("un article hors grille passe à la remise générale", () => {
    const found = pose({ lines: firm }).asRuleFor(
      context({ variantSku: "PAI-042", productSku: "PAI-042" }),
    );

    expect(discountBp(found)).toBe(3_000);
  });
});

describe("la pause et les avenants", () => {
  it("la pause du document suspend la remise", () => {
    const posed = pose().toPersistence();
    const paused = CompanyMercuriale.reconstitute({
      ...posed,
      lifecycle: { ...posed.lifecycle, pausedAt: MARCH, pausedBy: "auth0|staff" },
    });

    expect(paused.asRuleFor(context())?.suspendedFrom).toEqual(MARCH);
  });

  const amendment = (over: Partial<Parameters<CompanyMercuriale["amend"]>[1]> = {}) => ({
    lines: [],
    endedSkus: [],
    validFrom: MARCH,
    validTo: APRIL,
    reason: "Opération de printemps",
    origin: null,
    ...over,
  });

  it("un avenant change la remise sur sa fenêtre, puis celle d'avant reparle (§ 2.1)", () => {
    const amended = pose().amend(
      "am_1",
      amendment({ generalDiscount: { set: { ...ALL_30, baseBp: 2_000 } } }),
      "auth0|staff",
      FEBRUARY,
    );

    expect(discountBp(amended.asRuleFor(context()))).toBe(3_000);
    const during = amended.asRuleFor(context({ at: MARCH_10 }));
    expect(discountBp(during)).toBe(2_000);
    expect(during).toMatchObject({ validFrom: MARCH, validTo: APRIL });
    expect(discountBp(amended.asRuleFor(context({ at: APRIL_10 })))).toBe(3_000);
  });

  it("un avenant `{ set: null }` arrête la remise sur sa fenêtre", () => {
    const amended = pose().amend(
      "am_1",
      amendment({ validTo: null, generalDiscount: { set: null } }),
      "auth0|staff",
      FEBRUARY,
    );

    expect(amended.asRuleFor(context({ at: MARCH_10 }))).toBeNull();
    expect(amended.generalDiscountAt(APRIL_10)).toBeNull();
    expect(discountBp(amended.asRuleFor(context()))).toBe(3_000);
  });

  it("un avenant qui ne fait que changer la remise n'est pas vide", () => {
    expect(() =>
      pose().amend("am_1", amendment({ generalDiscount: { set: null } }), "auth0|staff", FEBRUARY),
    ).not.toThrow();
    expect(() => pose().amend("am_1", amendment(), "auth0|staff", FEBRUARY)).toThrow(
      EmptyAmendmentError,
    );
  });

  it("un avenant refuse une remise invalide", () => {
    expect(() =>
      pose().amend(
        "am_1",
        amendment({ generalDiscount: { set: { ...ALL_30, baseBp: 0 } } }),
        "auth0|staff",
        FEBRUARY,
      ),
    ).toThrow(InvalidGeneralDiscountError);
  });

  it("un avenant pose une remise sur une mercuriale qui n'en avait pas", () => {
    const firm = [{ sku: "PAI-042", tiers: [{ minQuantity: 1, unitPriceMillicents: 90_000 }] }];
    const amended = pose({ lines: firm, generalDiscount: null }).amend(
      "am_1",
      amendment({ generalDiscount: { set: ALL_30 } }),
      "auth0|staff",
      FEBRUARY,
    );

    expect(amended.asRuleFor(context())).toBeNull();
    expect(discountBp(amended.asRuleFor(context({ at: MARCH_10 })))).toBe(3_000);
  });
});
