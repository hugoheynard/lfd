import { PromotionWrongSurfaceError } from "../errors/promotion-errors.js";
import type { PromotionAudience } from "../promotion-audience.js";
import { audiencesMeet, commonPeriod, fulfillmentsMeet } from "../promotion-overlap.js";
import { PRICING_SURFACE, assertSurfaceAdmits } from "../promotion-surface.js";
import { FROM, UNTIL } from "./promotion-terms.fixture.js";

const of = (
  kind: Exclude<PromotionAudience["kind"], "company" | "company_and_sites">,
): PromotionAudience => ({ kind });

describe("audiencesMeet — un acheteur que les deux publics admettent", () => {
  it.each([
    ["pros_active", "everyone_but_active_pros", false],
    ["individuals", "pros", false],
    ["pros_active", "pros_pending", false],
    ["individuals_guest", "individuals_registered", false],
    ["pros", "pros_pending", true],
    ["everyone", "pros_active", true],
    // Une société suspendue est servie au public : « particuliers » l'admet.
    ["individuals", "everyone_but_active_pros", true],
    ["pros_pending", "everyone_but_active_pros", true],
  ] as const)("%s × %s → %s", (left, right, expected) => {
    expect(audiencesMeet(of(left), of(right))).toBe(expected);
    expect(audiencesMeet(of(right), of(left))).toBe(expected);
  });

  it("une société se rencontre avec son statut, jamais avec une autre société", () => {
    const acme = { kind: "company", companyId: "c_acme" } as const;
    expect(audiencesMeet(acme, of("pros_active"))).toBe(true);
    expect(audiencesMeet(acme, { kind: "company", companyId: "c_autre" })).toBe(false);
    expect(audiencesMeet(acme, { kind: "company_and_sites", companyId: "c_acme" })).toBe(true);
  });

  it("une société et ses sites rencontre le site qui la suit", () => {
    expect(
      audiencesMeet(
        { kind: "company_and_sites", companyId: "c_principal" },
        { kind: "company", companyId: "c_site" },
      ),
    ).toBe(true);
  });
});

describe("fulfillmentsMeet — une commande que les deux acheminements admettent", () => {
  it("retrait à un point rencontre « tout retrait », pas un autre point ni la livraison", () => {
    const coeur = { kind: "pickup_point", pickupId: "pk_coeur" } as const;
    expect(fulfillmentsMeet(coeur, { kind: "pickup" })).toBe(true);
    expect(fulfillmentsMeet(coeur, { kind: "pickup_point", pickupId: "pk_autre" })).toBe(false);
    expect(fulfillmentsMeet(coeur, { kind: "delivery" })).toBe(false);
    expect(fulfillmentsMeet({ kind: "any" }, { kind: "delivery" })).toBe(true);
  });
});

describe("commonPeriod — la fin est exclue", () => {
  it("rend la période commune, ou rien quand l'une s'ouvre à la fin de l'autre", () => {
    expect(
      commonPeriod({ validFrom: FROM, validTo: UNTIL }, { validFrom: FROM, validTo: null }),
    ).toEqual({ validFrom: FROM, validTo: UNTIL });
    expect(
      commonPeriod({ validFrom: FROM, validTo: UNTIL }, { validFrom: UNTIL, validTo: null }),
    ).toBeNull();
    expect(
      commonPeriod({ validFrom: FROM, validTo: null }, { validFrom: UNTIL, validTo: null }),
    ).toEqual({
      validFrom: UNTIL,
      validTo: null,
    });
  });
});

describe("assertSurfaceAdmits", () => {
  it("l'écran Promotions refuse un point ; un point refuse tout ce qui n'est pas lui", () => {
    const coeur = { kind: "pickup_point", pickupId: "pk_coeur" } as const;
    expect(() => assertSurfaceAdmits(PRICING_SURFACE, coeur, null)).toThrow(
      PromotionWrongSurfaceError,
    );
    expect(() => assertSurfaceAdmits(PRICING_SURFACE, { kind: "pickup" }, null)).not.toThrow();
    expect(() => assertSurfaceAdmits(coeur, coeur, null)).not.toThrow();
    expect(() => assertSurfaceAdmits(coeur, { kind: "pickup" }, null)).toThrow(
      PromotionWrongSurfaceError,
    );
  });
});
