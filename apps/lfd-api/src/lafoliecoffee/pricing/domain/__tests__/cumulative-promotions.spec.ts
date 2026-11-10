import { admittedPromotion } from "../../../promotions/domain/__tests__/live-promotion.fixture.js";
import type { AdmittedPromotion } from "../../../promotions/domain/live-promotion.js";
import type { PriceFloor, PriceRule, PricingContext } from "../price-rule.js";
import { resolvePrice } from "../resolve-price.js";

/**
 * **Le cumul sur demande, au point ligne** (`documentation/promotions/promotions.md`, § 2.11) : les promotions « Cumulable » se combinent l'une après
 * l'autre, dans un ordre déterministe ; une non cumulable face au résultat
 * cumulé, la plus avantageuse ; le plancher arrête la descente ; un seul
 * arrondi, en fin de chaîne. Les dates ne sont comparées qu'entre elles.
 */

const AT = new Date("2026-11-15T10:00:00.000Z");
const FROM = new Date("2026-11-01T00:00:00.000Z");
/** 10,00 € HT, en millicentimes : les pourcentages y tombent juste. */
const CANONICAL = 1_000_000;

function context(over: Partial<PricingContext> = {}): PricingContext {
  return {
    at: AT,
    quantity: 1,
    variantSku: "VIE-001-1",
    productSku: "VIE-001-1",
    categoryPath: ["fam-croissants", "fam-viennoiseries"],
    saleUnit: "piece",
    companyId: "co_1",
    pricingCompanyId: "co_1",
    segmentId: null,
    cumulativeQuantity: null,
    ...over,
  };
}

/** −`bp` sur tout ; `family` restreint à une famille de la lignée. */
function promo(
  id: string,
  bp: number,
  over: { cumulative?: boolean; family?: string } = {},
): AdmittedPromotion {
  return admittedPromotion({
    id,
    label: id,
    validFrom: FROM,
    effect: { kind: "percent_off", basisPoints: bp },
    cumulative: over.cumulative ?? false,
    scope:
      over.family === undefined
        ? { mode: "all_except", rules: [] }
        : {
            mode: "only",
            rules: [
              { target: "category", targetId: over.family, eligible: true, targetRank: null },
            ],
          },
  });
}

function priced(
  promotions: readonly AdmittedPromotion[],
  options: { floor?: PriceFloor; rules?: readonly PriceRule[]; canonical?: number } = {},
) {
  return resolvePrice(
    options.canonical ?? CANONICAL,
    { rules: options.rules ?? [], ladders: [], mercuriale: null, promotions },
    context(),
    options.floor ?? null,
  );
}

const CUMULATIVE = { cumulative: true } as const;

describe("le cumul de promotions au point ligne (§ 16)", () => {
  it("combine deux cumulables successivement : 20 % puis 15 % du reste = −32 %", () => {
    const result = priced([promo("a", 2_000, CUMULATIVE), promo("b", 1_500, CUMULATIVE)]);

    expect(result.finalMillicents).toBe(680_000);
    expect(result.steps.map((step) => [step.ruleId, step.resultMillicents])).toEqual([
      ["a", 800_000],
      ["b", 680_000],
    ]);
  });

  it("ordonne la chaîne par rang (la plus spécifique d'abord), puis par identifiant", () => {
    const global = promo("a_global", 2_000, CUMULATIVE);
    const family = promo("z_famille", 1_000, { ...CUMULATIVE, family: "fam-viennoiseries" });
    const twin = promo("b_global", 500, CUMULATIVE);

    const forward = priced([global, family, twin]);
    const backward = priced([twin, family, global]);

    expect(forward.steps.map((step) => step.ruleId)).toEqual(["z_famille", "a_global", "b_global"]);
    expect(backward.steps).toEqual(forward.steps);
    // 10 € × 0,9 × 0,8 × 0,95 = 6,84 € : l'ordre ne change pas le produit,
    // il fixe la trace — et c'est elle qu'on relit au litige.
    expect(forward.finalMillicents).toBe(684_000);
  });

  it("une non cumulable face au résultat cumulé : le cumul l'emporte quand il est plus bas", () => {
    const result = priced([
      promo("seule", 2_500),
      promo("a", 2_000, CUMULATIVE),
      promo("b", 1_500, CUMULATIVE),
    ]);

    expect(result.finalMillicents).toBe(680_000);
    expect(result.steps.map((step) => step.ruleId)).toEqual(["a", "b"]);
    expect(result.steps[0]?.supersedes).toEqual([{ ruleId: "seule", label: "seule" }]);
    expect(result.rejected).toContainEqual(
      expect.objectContaining({ ruleId: "seule", cause: "superseded" }),
    );
  });

  it("une non cumulable face au résultat cumulé : elle l'emporte quand elle est plus avantageuse", () => {
    const result = priced([
      promo("seule", 4_000),
      promo("a", 2_000, CUMULATIVE),
      promo("b", 1_500, CUMULATIVE),
    ]);

    expect(result.finalMillicents).toBe(600_000);
    expect(result.steps.map((step) => step.ruleId)).toEqual(["seule"]);
    expect(
      result.rejected.filter((entry) => entry.cause === "superseded").map((e) => e.ruleId),
    ).toEqual(["a", "b"]);
  });

  it("à égalité, la non cumulable — l'existant — l'emporte", () => {
    // 20 % puis 15 % = 32 % pile : la non cumulable à 32 % rend le même prix.
    const result = priced([
      promo("seule", 3_200),
      promo("a", 2_000, CUMULATIVE),
      promo("b", 1_500, CUMULATIVE),
    ]);

    expect(result.finalMillicents).toBe(680_000);
    expect(result.steps.map((step) => step.ruleId)).toEqual(["seule"]);
  });

  it("le plancher arrête la descente, quel que soit le nombre d'étapes", () => {
    const result = priced(
      [promo("a", 2_000, CUMULATIVE), promo("b", 1_500, CUMULATIVE), promo("c", 1_000, CUMULATIVE)],
      { floor: { mode: "percent", bp: 7_500 } },
    );

    expect(result.floored).toBe(true);
    expect(result.finalMillicents).toBe(750_000);
    // La trace garde chaque étape : le plancher se lit en plus, il n'efface rien.
    expect(result.steps).toHaveLength(3);
  });

  it("n'arrondit qu'une fois, en fin de chaîne", () => {
    // 12,34567 € × 0,8 × 0,85 = 8,3950556 € → 839 506 mc.
    const result = priced([promo("a", 2_000, CUMULATIVE), promo("b", 1_500, CUMULATIVE)], {
      canonical: 1_234_567,
    });
    expect(result.finalMillicents).toBe(839_506);

    // Le cas qui sépare les deux arrondis : la première étape AFFICHE 4 901 mc
    // sans nourrir la seconde de son arrondi.
    const tiny = priced([promo("a", 3_000, CUMULATIVE), promo("b", 3_000, CUMULATIVE)], {
      canonical: 7_001,
    });
    // 7 001 × 0,49 = 3 430,49 → 3 430 (un seul arrondi) ; par étape, 4 901 × 0,7
    // = 3 430,7 → 3 431.
    expect(tiny.finalMillicents).toBe(3_430);
    expect(tiny.steps.map((step) => step.resultMillicents)).toEqual([4_901, 3_430]);
  });

  it("une cumulable que la politique de la mercuriale n'accepte pas est scellée ; la chaîne continue sans elle", () => {
    const merc: PriceRule = {
      id: "merc",
      stage: "mercuriale",
      scope: { type: "variant", id: "VIE-001-1" },
      audience: { type: "company", id: "co_1" },
      minQuantity: null,
      validFrom: FROM,
      validTo: null,
      suspendedFrom: null,
      label: "Mercuriale",
      stacksOverMercuriale: false,
      promotionAdmission: { mode: "selected", promotionIds: ["franchit"] },
      nature: "replace",
      amountMillicents: 900_000,
    };
    const result = priced(
      [promo("scellée", 2_000, CUMULATIVE), promo("franchit", 1_000, CUMULATIVE)],
      { rules: [merc] },
    );

    expect(result.finalMillicents).toBe(810_000);
    expect(result.steps.map((step) => step.ruleId)).toEqual(["merc", "franchit"]);
    expect(result.sealedRuleIds).toEqual(["scellée"]);
  });

  it("une seule cumulable vaut une promotion : même prix qu'une non cumulable seule", () => {
    expect(priced([promo("a", 2_000, CUMULATIVE)]).finalMillicents).toBe(
      priced([promo("a", 2_000)]).finalMillicents,
    );
  });

  /** § 16.1 : sans cumulable, l'étage suit le chemin d'avant — au centime. */
  it("sans cumulable, rien ne change : la plus spécifique, puis la plus avantageuse", () => {
    const result = priced([
      promo("global", 3_000),
      promo("famille", 1_000, { family: "fam-viennoiseries" }),
    ]);

    expect(result.finalMillicents).toBe(900_000);
    expect(result.steps.map((step) => step.ruleId)).toEqual(["famille"]);
    expect(result.steps[0]?.supersedes).toEqual([{ ruleId: "global", label: "global" }]);
  });
});
