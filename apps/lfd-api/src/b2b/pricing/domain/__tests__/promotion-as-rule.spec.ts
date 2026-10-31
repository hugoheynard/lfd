import type { AdmittedPromotion } from "../../../promotions/domain/live-promotion.js";
import {
  admittedPromotion,
  type LivePromotionOverrides,
} from "../../../promotions/domain/__tests__/live-promotion.fixture.js";
import type { PriceRule, PricingContext } from "../price-rule.js";
import { promotionAsRule } from "../promotion-as-rule.js";
import { resolvePrice } from "../resolve-price.js";
import { grams, lineTotalCents } from "@lfd/money";

/**
 * **Le point ligne reproduit les règles d'étage promotion au centime** (plan
 * des promotions, § 13.2, § 13.5 et § 13.11, lot L5) : chaque règle est
 * écrite telle que la reprise SQL l'a traduite (§ 13.4), et les deux chaînes
 * — la règle, puis la promotion — doivent rendre le même prix ET la même
 * trace. Les dates ne sont comparées qu'entre elles.
 */

const AT = new Date("2026-11-15T10:00:00.000Z");
const FROM = new Date("2026-11-01T00:00:00.000Z");
const CANONICAL = 237_000;

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

function rule(over: Partial<PriceRule> = {}): PriceRule {
  return {
    id: "r_promo",
    stage: "promotion",
    scope: { type: "global", id: null },
    audience: { type: "all", id: null },
    minQuantity: null,
    validFrom: FROM,
    validTo: null,
    suspendedFrom: null,
    label: "Promo",
    stacksOverMercuriale: false,
    nature: "alter",
    alteration: { direction: "decrease", mode: "percent", bp: 1500 },
    ...over,
  } as PriceRule;
}

/** La règle, telle que la reprise l'écrit : même id, même libellé, même fenêtre. */
function reprise(source: PriceRule, over: LivePromotionOverrides): AdmittedPromotion {
  return admittedPromotion({
    id: source.id,
    label: source.label,
    validFrom: source.validFrom,
    validTo: source.validTo,
    suspendedFrom: source.suspendedFrom,
    stacksOverMercuriale: source.stacksOverMercuriale,
    conditions:
      source.minQuantity === null ? [] : [{ kind: "min_quantity", value: source.minQuantity }],
    effect: effectOf(source),
    ...over,
  });
}

/** L'effet, comme la reprise SQL le traduit (§ 13.4). */
function effectOf(source: PriceRule): AdmittedPromotion["effect"] {
  if (source.nature === "replace") {
    return { kind: "fixed_unit_price", millicents: source.amountMillicents };
  }
  const { alteration } = source;
  return alteration.mode === "percent"
    ? { kind: "percent_off", basisPoints: alteration.bp }
    : { kind: "unit_amount_off", millicents: alteration.millicents };
}

const MERCURIALE: PriceRule = rule({
  id: "merc",
  stage: "mercuriale",
  audience: { type: "company", id: "co_1" },
  nature: "replace",
  amountMillicents: 200_000,
});

function both(
  legacy: readonly PriceRule[],
  promotions: readonly AdmittedPromotion[],
  ctx: PricingContext = context(),
  others: readonly PriceRule[] = [],
) {
  const before = resolvePrice(
    CANONICAL,
    { rules: [...others, ...legacy], ladders: [], mercuriale: null, promotions: [] },
    ctx,
  );
  const after = resolvePrice(
    CANONICAL,
    { rules: [...others], ladders: [], mercuriale: null, promotions },
    ctx,
  );
  return { before, after };
}

function expectSame(
  legacy: readonly PriceRule[],
  promotions: readonly AdmittedPromotion[],
  ctx?: PricingContext,
  others?: readonly PriceRule[],
) {
  const { before, after } = both(legacy, promotions, ctx, others);
  expect(after.finalMillicents).toBe(before.finalMillicents);
  // La trace d'une promotion porte en PLUS ses trois langues (L8b, additif) :
  // tout le reste de l'étape est celui de la règle reprise.
  expect(after.steps.map(({ labels: _labels, ...step }) => step)).toEqual(before.steps);
  for (const step of after.steps.filter((entry) => entry.labels !== undefined)) {
    expect(step.labels?.fr).toBe(step.label);
  }
  expect(after.rejected).toEqual(before.rejected);
  expect(after.sealedRuleIds).toEqual(before.sealedRuleIds);
  return before;
}

describe("promotionAsRule — la reprise d'une règle rend le même prix et la même trace", () => {
  it("globale, en pourcentage", () => {
    const source = rule();
    const priced = expectSame([source], [reprise(source, {})]);
    expect(priced.finalMillicents).toBeLessThan(CANONICAL);
  });

  it("de famille (la parente), en montant", () => {
    const source = rule({
      scope: { type: "category", id: "fam-viennoiseries" },
      alteration: { direction: "decrease", mode: "amount", millicents: 30_000 },
    });
    expectSame(
      [source],
      [
        reprise(source, {
          scope: {
            mode: "only",
            rules: [
              {
                target: "category",
                targetId: "fam-viennoiseries",
                eligible: true,
                targetRank: null,
              },
            ],
          },
        }),
      ],
    );
  });

  it("de produit (rang 2) en prix posé, et de déclinaison (rang 3)", () => {
    const product = rule({
      id: "r_prod",
      scope: { type: "product", id: "VIE-001-1" },
      nature: "replace",
      amountMillicents: 150_000,
    });
    const variant = rule({ id: "r_var", scope: { type: "variant", id: "VIE-001-1" } });
    expectSame(
      [product, variant],
      [
        reprise(product, {
          scope: {
            mode: "only",
            rules: [{ target: "variant", targetId: "VIE-001-1", eligible: true, targetRank: 2 }],
          },
        }),
        reprise(variant, {
          scope: {
            mode: "only",
            rules: [{ target: "variant", targetId: "VIE-001-1", eligible: true, targetRank: null }],
          },
        }),
      ],
    );
  });

  it("une règle « société » bat la règle « tous », des deux côtés", () => {
    const all = rule({
      id: "r_all",
      alteration: { direction: "decrease", mode: "percent", bp: 3000 },
    });
    const company = rule({ id: "r_co", audience: { type: "company", id: "co_1" } });
    const priced = expectSame(
      [all, company],
      [reprise(all, {}), reprise(company, { audience: { kind: "company", companyId: "co_1" } })],
    );
    expect(priced.steps[0]?.ruleId).toBe("r_co");
  });

  it.each([
    ["sous le seuil", 4],
    ["au seuil", 5],
  ])("le seuil de quantité : %s", (_label, quantity) => {
    const source = rule({ minQuantity: 5 });
    expectSame([source], [reprise(source, {})], context({ quantity }));
  });

  it("un montant ne vise pas un article au poids par une famille ni par le mode, des deux côtés", () => {
    const amount = {
      nature: "alter",
      alteration: { direction: "decrease", mode: "amount", millicents: 50_000 },
    } as const;
    const global = rule({ id: "r_g", ...amount });
    const family = rule({
      id: "r_f",
      scope: { type: "category", id: "fam-croissants" },
      ...amount,
    });
    // Le prix et les étages seulement : en production, l'index par portée
    // n'apporte pas ces règles-là à la chaîne (`scopeKeysOf`), et la trace
    // n'en dit rien ; passées ici à la main, `applies` les nomme hors portée.
    const { before, after } = both(
      [global, family],
      [
        reprise(global, {}),
        reprise(family, {
          scope: {
            mode: "only",
            rules: [
              { target: "category", targetId: "fam-croissants", eligible: true, targetRank: null },
            ],
          },
        }),
      ],
      context({ saleUnit: "weight", quantity: 1250 }),
    );
    expect(after.finalMillicents).toBe(before.finalMillicents);
    expect(after.steps).toEqual([]);
    expect(before.steps).toEqual([]);
  });

  it("une règle de prix ordinaire en pourcentage ne vise toujours pas le poids par famille ni mode", () => {
    const before = resolvePrice(
      CANONICAL,
      { rules: [rule({ id: "r_g" })], ladders: [], mercuriale: null, promotions: [] },
      context({ saleUnit: "weight", quantity: 1250 }),
    );
    expect(before.steps).toEqual([]);
    expect(before.finalMillicents).toBe(CANONICAL);
  });
  it.each([false, true])("sous mercuriale, cumul %s : scellée ou non, pareil", (stacks) => {
    const source = rule({ stacksOverMercuriale: stacks });
    expectSame([source], [reprise(source, {})], context(), [MERCURIALE]);
  });

  it("une promotion en pause depuis avant l'instant n'agit plus, comme la règle suspendue", () => {
    const source = rule({ suspendedFrom: FROM });
    const before = resolvePrice(
      CANONICAL,
      { rules: [], ladders: [], mercuriale: null, promotions: [] },
      context(),
    );
    const after = resolvePrice(
      CANONICAL,
      { rules: [], ladders: [], mercuriale: null, promotions: [reprise(source, {})] },
      context(),
    );
    // Une règle suspendue n'atteint pas la chaîne (`inForceFor`) ; la promotion
    // en pause non plus quand le chargeur l'a filtrée — ici, `applies` la rejette.
    expect(after.finalMillicents).toBe(before.finalMillicents);
  });
});

describe("promotionAsRule — ce qui n'est pas une règle de prix", () => {
  it("ne présente pas une promotion qui ne couvre pas l'article", () => {
    const excluded = admittedPromotion({
      scope: {
        mode: "all_except",
        rules: [{ target: "variant", targetId: "VIE-001-1", eligible: false, targetRank: null }],
      },
    });
    expect(promotionAsRule(excluded, context())).toBeNull();
  });

  it("ne présente pas une portée par produit : la chaîne ne connaît pas le `product_id`", () => {
    const byProduct = admittedPromotion({
      scope: {
        mode: "all_except",
        rules: [{ target: "product", targetId: "p_croissant", eligible: false, targetRank: null }],
      },
    });
    expect(promotionAsRule(byProduct, context())).toBeNull();
  });

  it("met le public en tête : « pros actifs · tout » bat « tous · ce produit »", () => {
    const pros = admittedPromotion({ id: "pros", audience: { kind: "pros_active" } });
    const product = admittedPromotion({
      id: "prod",
      effect: { kind: "percent_off", basisPoints: 5000 },
      scope: {
        mode: "only",
        rules: [{ target: "variant", targetId: "VIE-001-1", eligible: true, targetRank: null }],
      },
    });
    const priced = resolvePrice(
      CANONICAL,
      { rules: [], ladders: [], mercuriale: null, promotions: [product, pros] },
      context(),
    );
    expect(priced.steps.map((step) => step.ruleId)).toEqual(["pros"]);
  });

  it("à égalité stricte, la plus avantageuse pour le client, puis le plus petit id", () => {
    const small = admittedPromotion({
      id: "b_small",
      effect: { kind: "percent_off", basisPoints: 1000 },
    });
    const big = admittedPromotion({
      id: "c_big",
      effect: { kind: "percent_off", basisPoints: 2500 },
    });
    const twin = admittedPromotion({
      id: "a_twin",
      effect: { kind: "percent_off", basisPoints: 2500 },
    });
    const priced = resolvePrice(
      CANONICAL,
      { rules: [], ladders: [], mercuriale: null, promotions: [small, big, twin] },
      context(),
    );
    expect(priced.steps.map((step) => step.ruleId)).toEqual(["a_twin"]);
  });

  /** § 16.1 : la case « Cumulable » voyage jusqu'à la chaîne, et seulement cochée. */
  it("porte « Cumulable » quand la promotion la coche, et rien sinon", () => {
    const ticked = promotionAsRule(admittedPromotion({ cumulative: true }), context());
    const plain = promotionAsRule(admittedPromotion(), context());

    expect(ticked?.cumulative).toBe(true);
    expect(plain).not.toHaveProperty("cumulative");
  });
});

describe("promotionAsRule — un pourcentage s'étend au poids (décision du 2026-10-31)", () => {
  const WEIGHT = context({ saleUnit: "weight", quantity: 1250 });
  const PER_KILO = 2_390_000;
  const TEN = { kind: "percent_off", basisPoints: 1000 } as const;
  const FAMILY_ONLY = {
    mode: "only",
    rules: [{ target: "category", targetId: "fam-croissants", eligible: true, targetRank: null }],
  } as const;

  function price(promotions: readonly AdmittedPromotion[], ctx: PricingContext = WEIGHT) {
    return resolvePrice(PER_KILO, { rules: [], ladders: [], mercuriale: null, promotions }, ctx);
  }

  it("« −10 % tout sauf » baisse le prix au kilo, et la ligne au poids réel tombe juste", () => {
    const priced = price([admittedPromotion({ id: "all", effect: TEN })]);
    expect(priced.steps.map((step) => step.ruleId)).toEqual(["all"]);
    expect(priced.finalMillicents).toBe(2_151_000);
    // 21,51 €/kg × 1,250 kg = 26,8875 € : un seul arrondi, au poids réel.
    expect(lineTotalCents(priced.finalMillicents, grams(1250))).toBe(2689);
  });

  it("par sa famille, et la règle rendue vise le SKU au rang de la famille", () => {
    const promotion = admittedPromotion({ effect: TEN, scope: FAMILY_ONLY });
    const presented = promotionAsRule(promotion, WEIGHT);
    expect(presented?.scope).toEqual({ type: "variant", id: "VIE-001-1" });
    expect(presented?.promotion?.coverage).toEqual({ scopeRank: 1, familyCloseness: 2 });
    expect(promotionAsRule(promotion, context())?.promotion).not.toHaveProperty("coverage");
  });

  it("une exclusion de famille le retire toujours", () => {
    const excluded = admittedPromotion({
      effect: TEN,
      scope: {
        mode: "all_except",
        rules: [
          { target: "category", targetId: "fam-croissants", eligible: false, targetRank: null },
        ],
      },
    });
    expect(promotionAsRule(excluded, WEIGHT)).toBeNull();
  });

  it("un montant, un prix posé ne s'étendent pas", () => {
    const amount = admittedPromotion({ effect: { kind: "unit_amount_off", millicents: 50_000 } });
    const fixed = admittedPromotion({
      effect: { kind: "fixed_unit_price", millicents: 1_000_000 },
    });
    expect(promotionAsRule(amount, WEIGHT)).toBeNull();
    expect(promotionAsRule(fixed, WEIGHT)).toBeNull();
  });

  it("un pourcentage à quantité minimum ne s'étend pas, même seuil atteint", () => {
    const fromThree = admittedPromotion({
      effect: TEN,
      conditions: [{ kind: "min_quantity", value: 3 }],
    });
    expect(promotionAsRule(fromThree, WEIGHT)).toBeNull();
    expect(price([fromThree]).finalMillicents).toBe(PER_KILO);
  });

  it("garde le rang de sa décision : une promotion qui nomme l'article bat le mode étendu", () => {
    const everything = admittedPromotion({
      id: "a_all",
      effect: { kind: "percent_off", basisPoints: 3000 },
    });
    const named = admittedPromotion({
      id: "b_named",
      effect: TEN,
      scope: {
        mode: "only",
        rules: [{ target: "variant", targetId: "VIE-001-1", eligible: true, targetRank: null }],
      },
    });
    expect(price([everything, named]).steps.map((step) => step.ruleId)).toEqual(["b_named"]);
  });

  it("garde la proximité : la sous-famille bat la parente, comme à la pièce", () => {
    const parent = admittedPromotion({
      id: "a_parent",
      effect: { kind: "percent_off", basisPoints: 3000 },
      scope: {
        mode: "only",
        rules: [
          { target: "category", targetId: "fam-viennoiseries", eligible: true, targetRank: null },
        ],
      },
    });
    const child = admittedPromotion({ id: "b_child", effect: TEN, scope: FAMILY_ONLY });
    expect(price([parent, child]).steps.map((step) => step.ruleId)).toEqual(["b_child"]);
    expect(price([parent, child], context()).steps.map((step) => step.ruleId)).toEqual(["b_child"]);
  });
});
