import type { CartAdjustment, DeliveryPricingTerms } from "@lfd/contracts";

import {
  deliveryAudienceTermsOf,
  InvalidDeliveryFeeError,
  InvalidFreeDeliveryThresholdError,
} from "../delivery-audience-terms.js";
import { DeliveryPricing } from "../delivery-pricing.js";

const AUTHOR = { staffUserId: "staff_a", name: "Camille", role: "admin" };
const AT = new Date(0);
const NOTHING: DeliveryPricingTerms = {
  b2b: { fee: null, freeDeliveryThresholdCents: null },
  b2c: { fee: null, freeDeliveryThresholdCents: null },
};

function feeTerms(fee: CartAdjustment) {
  return { fee, freeDeliveryThresholdCents: null };
}

describe("les termes de livraison d'une audience", () => {
  it("rien de réglé est permis", () => {
    expect(deliveryAudienceTermsOf("b2b", NOTHING.b2b)).toEqual(NOTHING.b2b);
  });

  it("un frais nul, un taux de 100 % et un franco nul sont permis", () => {
    expect(() =>
      deliveryAudienceTermsOf("b2c", feeTerms({ mode: "amount", cents: 0 })),
    ).not.toThrow();
    expect(() =>
      deliveryAudienceTermsOf("b2c", feeTerms({ mode: "percent", bp: 10_000 })),
    ).not.toThrow();
    expect(() =>
      deliveryAudienceTermsOf("b2c", { fee: null, freeDeliveryThresholdCents: 0 }),
    ).not.toThrow();
  });

  it.each<[string, CartAdjustment]>([
    ["un montant négatif", { mode: "amount", cents: -1 }],
    ["une fraction de centime", { mode: "amount", cents: 1.5 }],
    ["un taux négatif", { mode: "percent", bp: -1 }],
    ["un taux au-delà de 100 %", { mode: "percent", bp: 10_001 }],
  ])("refuse un frais : %s", (_case, fee) => {
    expect(() => deliveryAudienceTermsOf("b2b", feeTerms(fee))).toThrow(InvalidDeliveryFeeError);
  });

  it.each([-1, 0.5])("refuse un franco de %p centimes", (cents) => {
    expect(() =>
      deliveryAudienceTermsOf("b2c", { fee: null, freeDeliveryThresholdCents: cents }),
    ).toThrow(InvalidFreeDeliveryThresholdError);
  });

  it("le refus nomme l'audience", () => {
    expect(() => deliveryAudienceTermsOf("b2c", feeTerms({ mode: "amount", cents: -1 }))).toThrow(
      /des particuliers/u,
    );
  });
});

describe("DeliveryPricing.pose", () => {
  it("ne change que les clés présentes du patch", () => {
    const current: DeliveryPricingTerms = {
      b2b: { fee: { mode: "amount", cents: 900 }, freeDeliveryThresholdCents: 5_000 },
      b2c: { fee: { mode: "amount", cents: 1_500 }, freeDeliveryThresholdCents: 8_000 },
    };

    const posed = DeliveryPricing.pose({
      current,
      patch: { b2b: { freeDeliveryThresholdCents: 6_000 } },
      at: AT,
      author: AUTHOR,
    });

    expect(posed.terms).toEqual({
      b2b: { fee: { mode: "amount", cents: 900 }, freeDeliveryThresholdCents: 6_000 },
      b2c: current.b2c,
    });
    expect(posed.at).toBe(AT);
    expect(posed.author).toBe(AUTHOR);
  });

  it("`null` efface une valeur", () => {
    const posed = DeliveryPricing.pose({
      current: { ...NOTHING, b2c: feeTerms({ mode: "amount", cents: 1_500 }) },
      patch: { b2c: { fee: null } },
      at: AT,
      author: AUTHOR,
    });

    expect(posed.terms.b2c.fee).toBeNull();
  });

  it("refuse un patch qui poserait un frais invalide", () => {
    expect(() =>
      DeliveryPricing.pose({
        current: NOTHING,
        patch: { b2b: { fee: { mode: "percent", bp: 20_000 } } },
        at: AT,
        author: AUTHOR,
      }),
    ).toThrow(InvalidDeliveryFeeError);
  });
});
