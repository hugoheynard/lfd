import { frozenPickupDiscountBaseOf, pickupDiscountBaseOf } from "../pickup-discount-base.js";

/**
 * « Remise retrait sur X € éligibles » (lot C du plan des exclusions) : une
 * assiette dite seulement quand elle diffère du panier.
 */
const BREAD = { sku: "PAI", lineTotalCents: 1_000, lineTotalTtcCents: 1_055, eligible: true };
const CROISSANT = { sku: "VIE", lineTotalCents: 500, lineTotalTtcCents: 528, eligible: true };
const MUG = { sku: "TAS", lineTotalCents: 1_250, lineTotalTtcCents: 1_500, eligible: false };

describe("l'assiette de la remise de retrait", () => {
  it("additionne les seules lignes éligibles, en HT et en TTC, et nomme les exclues", () => {
    expect(pickupDiscountBaseOf(true, [BREAD, MUG, CROISSANT])).toEqual({
      eligibleHtCents: 1_500,
      eligibleTtcCents: 1_583,
      excludedSkus: ["TAS"],
    });
  });

  it("ne dit rien quand aucune ligne n'est exclue", () => {
    expect(pickupDiscountBaseOf(true, [BREAD, CROISSANT])).toBeNull();
  });

  it("ne dit rien sans remise de retrait, même avec une ligne exclue", () => {
    expect(pickupDiscountBaseOf(false, [BREAD, MUG])).toBeNull();
  });

  it("tait le TTC quand une ligne éligible n'en a pas de scellé (commande pro)", () => {
    const pro = [{ ...BREAD, lineTotalTtcCents: null }, MUG];
    expect(pickupDiscountBaseOf(true, pro)?.eligibleTtcCents).toBeNull();
  });

  it("un TTC manquant sur une ligne EXCLUE ne fait pas taire celui de l'assiette", () => {
    const mixed = [BREAD, { ...MUG, lineTotalTtcCents: null }];
    expect(pickupDiscountBaseOf(true, mixed)?.eligibleTtcCents).toBe(1_055);
  });
});

describe("l'assiette relue sur une commande figée", () => {
  const frozenLine = (sku: string, ht: number, excluded: boolean) => ({
    sku,
    lineTotalCents: ht,
    lineTotalTtcCents: null,
    ...(excluded ? { pickupDiscountEligible: false as const } : {}),
  });

  it("lit le drapeau figé de chaque ligne, et rend un champ à étaler", () => {
    const field = frozenPickupDiscountBaseOf({
      discountCents: 100,
      lines: [frozenLine("PAI", 1_000, false), frozenLine("TAS", 1_250, true)],
    });
    expect(field).toEqual({
      pickupDiscountBase: { eligibleHtCents: 1_000, eligibleTtcCents: null, excludedSkus: ["TAS"] },
    });
  });

  it("rend un champ VIDE sans remise : la clé reste absente", () => {
    const field = frozenPickupDiscountBaseOf({
      discountCents: 0,
      lines: [frozenLine("PAI", 1_000, false), frozenLine("TAS", 1_250, true)],
    });
    expect(field).toEqual({});
    expect(field).not.toHaveProperty("pickupDiscountBase");
  });
});
