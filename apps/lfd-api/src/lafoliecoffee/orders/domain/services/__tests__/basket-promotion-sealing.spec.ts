import { admittedPromotion } from "../../../../promotions/domain/__tests__/live-promotion.fixture.js";
import type { AdmittedPromotion } from "../../../../promotions/domain/live-promotion.js";
import {
  chooseBasketPromotion,
  lineSealingOf,
  outcomeOf,
  type BasketLine,
} from "../basket-promotion-choice.js";

/**
 * **Le panier apprend qu'une ligne est scellée** (`plan-la-mercuriale-decide.md`,
 * § 8, bloquant 2) : une remise de panier exclut de son assiette, PAR
 * PROMOTION, la ligne qu'une mercuriale fixe et dont la politique refuse
 * cette promotion.
 */

function basket(id: string, bp: number, cumulative = false): AdmittedPromotion {
  return admittedPromotion({
    id,
    effect: { kind: "percent_off", basisPoints: bp },
    fulfillment: { kind: "basket", pickup: "all", delivery: "none" },
    scope: { mode: "all_except", rules: [] },
    cumulative,
  });
}

const NEGOTIATED = "VIE-012";
const FREE = "PAI-001";

function lines(sealing: BasketLine["sealing"]): BasketLine[] {
  return [
    { sku: NEGOTIATED, htCents: 1_000, quantity: 10, sealing },
    { sku: FREE, htCents: 2_000, quantity: 1 },
  ];
}

describe("l'assiette d'une remise de panier, ligne scellée", () => {
  it("« Aucune » : la ligne négociée sort de l'assiette, l'autre y reste", () => {
    const outcome = outcomeOf(
      basket("promo_a", 1_000),
      lines({ mercurialeId: "merc_1", admission: { mode: "none", promotionIds: [] } }),
      new Map(),
    );
    expect([...outcome.ineligibleSkus]).toEqual([NEGOTIATED]);
    expect(outcome.discountCents).toBe(200);
  });

  it("« Toutes » : la ligne négociée reste dans l'assiette", () => {
    const outcome = outcomeOf(
      basket("promo_a", 1_000),
      lines({ mercurialeId: "merc_1", admission: { mode: "all", promotionIds: [] } }),
      new Map(),
    );
    expect(outcome.ineligibleSkus.size).toBe(0);
    expect(outcome.discountCents).toBe(300);
  });

  it("« Au choix » : l'assiette se juge par promotion", () => {
    const sealed = lines({
      mercurialeId: "merc_1",
      admission: { mode: "selected", promotionIds: ["promo_a"] },
    });
    expect(outcomeOf(basket("promo_a", 1_000), sealed, new Map()).discountCents).toBe(300);
    expect(outcomeOf(basket("promo_b", 1_000), sealed, new Map()).discountCents).toBe(200);
  });

  it("deux cumulables, une seule choisie : chacune sur sa propre assiette", () => {
    const sealed = lines({
      mercurialeId: "merc_1",
      admission: { mode: "selected", promotionIds: ["promo_a"] },
    });
    const chosen = chooseBasketPromotion(
      [basket("promo_a", 1_000, true), basket("promo_b", 1_000, true)],
      sealed,
      new Map(),
    );
    const bySteps = new Map(chosen.applied.map((step) => [step.promotionId, step]));
    expect([...(bySteps.get("promo_a")?.ineligibleSkus ?? [])]).toEqual([]);
    expect([...(bySteps.get("promo_b")?.ineligibleSkus ?? [])]).toEqual([NEGOTIATED]);
  });

  it("une ligne que rien ne scelle : rien ne change", () => {
    const outcome = outcomeOf(basket("promo_a", 1_000), lines(null), new Map());
    expect(outcome.discountCents).toBe(300);
  });

  it("le scellement se lit sur la résolution : id du document et politique", () => {
    expect(lineSealingOf({ sealedByRuleId: null, sealingAdmission: null })).toBeNull();
    expect(
      lineSealingOf({
        sealedByRuleId: "merc_1",
        sealingAdmission: { mode: "all", promotionIds: [] },
      }),
    ).toEqual({ mercurialeId: "merc_1", admission: { mode: "all", promotionIds: [] } });
  });
});
