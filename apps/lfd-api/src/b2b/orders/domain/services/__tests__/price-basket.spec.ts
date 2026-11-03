import type { LateFeeAdjustment } from "@lfd/contracts";

import type { BasketCart } from "../basket-pricing-context.js";
import { priceBasket } from "../price-basket.js";
import { contextOf, DELIVERY, TEN_PERCENT_AT_SITE } from "./price-basket.fixture.js";

/**
 * `priceBasket` — plan `documentation/pricing/centime-et-tva/plan-un-seul-assemblage.md`,
 * § 2.2 et § 2.3 : pur, synchrone, par entrées construites. Ce qu'il calcule
 * est ce que la composition calculait (lot L1a) ; le golden master
 * (`test/pricing-golden-master.e2e-spec.ts`) le tient au centime sur les vrais
 * chemins, cette suite en nomme les règles.
 */
const PRO: BasketCart = { vatMethod: "line_ht", handoverAt: null };
const PERSONAL: BasketCart = { vatMethod: "exact_ht", handoverAt: null };
const NO_VERDICT = { lateFee: null };

describe("priceBasket — le prix d'un panier chargé", () => {
  it("retrait : la promotion panier du point retenu, sur le sous-total HT arrondi par ligne", () => {
    const amounts = priceBasket(contextOf(), PRO, NO_VERDICT);

    expect(amounts.subtotalCents).toBe(2_000);
    expect(amounts.terms).toMatchObject({
      discountCents: 200,
      discountAdjustment: { mode: "percent", bp: 1_000 },
      discountPromotionId: TEN_PERCENT_AT_SITE.id,
      deliveryFeeCents: 0,
      deliveryFeeAdjustment: null,
      lateFeeCents: 0,
      lateFeeAdjustment: null,
      deliveryVatMode: "standard",
    });
    expect(amounts.refusals).toEqual([]);
  });

  it("fige sur chaque ligne son rangement et son éligibilité, « on ne savait pas » compris", () => {
    const [pain, boisson] = priceBasket(contextOf(), PRO, NO_VERDICT).terms.lines;

    expect(pain).toMatchObject({
      pickupDiscountEligible: true,
      productId: "p_pain",
      categoryId: "c_pains",
      madeToOrder: false,
    });
    expect(boisson).toMatchObject({ productId: null, categoryId: null, madeToOrder: null });
  });

  it("coursier : les frais de la zone, et aucune promotion qui ne vise que le retrait", () => {
    const amounts = priceBasket(contextOf({ route: DELIVERY }), PRO, NO_VERDICT);

    expect(amounts.terms).toMatchObject({
      discountCents: 0,
      discountAdjustment: null,
      deliveryFeeCents: 1_000,
      deliveryFeeAdjustment: { mode: "amount", cents: 1_000 },
    });
  });

  it("exact_ht : le port en TTC, au mode de TVA du panier chargé", () => {
    const standard = priceBasket(contextOf({ route: DELIVERY }), PERSONAL, NO_VERDICT);
    const follows = priceBasket(
      contextOf({ route: DELIVERY, deliveryVatMode: "follows_goods" }),
      PERSONAL,
      NO_VERDICT,
    );

    expect(standard.terms.deliveryFeeCents).toBe(1_200);
    // La TVA du port suit celle des marchandises, au prorata de leur poids.
    expect(follows.terms.deliveryFeeCents).toBe(1_132);
    expect(follows.terms.deliveryVatMode).toBe("follows_goods");
  });

  it("exact_ht : la remise du point se prend sur le TTC — 10 % de 22,55 € = 2,26 €", () => {
    expect(priceBasket(contextOf(), PERSONAL, NO_VERDICT).terms.discountCents).toBe(226);
  });

  it("la surtaxe n'existe que par son verdict, appliquée au sous-total (§ 2.3)", () => {
    const lateFee: LateFeeAdjustment = {
      adjustment: { mode: "percent", bp: 500 },
      vatRatePercent: 20,
    };

    const amounts = priceBasket(contextOf(), PRO, { lateFee });

    expect(amounts.terms.lateFeeCents).toBe(100);
    expect(amounts.terms.lateFeeAdjustment).toEqual(lateFee);
  });

  it("révision : les remises de la commande sont REJOUÉES, jamais rejugées", () => {
    const amounts = priceBasket(
      contextOf({ replayed: { lines: [], discounts: [] } }),
      PRO,
      NO_VERDICT,
    );

    // La promotion du point s'appliquerait à un panier neuf ; la commande n'en portait aucune.
    expect(amounts.terms.discountCents).toBe(0);
    expect(amounts.terms.discountPromotionId).toBeNull();
    expect(amounts.refusals).toEqual([]);
  });

  it("même contexte, même panier : même résultat (G3)", () => {
    const context = contextOf();

    expect(priceBasket(context, PRO, NO_VERDICT)).toEqual(priceBasket(context, PRO, NO_VERDICT));
  });
});
