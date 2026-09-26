import { LoyaltyHolder } from "../../value-objects/loyalty-holder.js";
import {
  LoyaltySettings,
  type LoyaltySettingsInput,
} from "../../value-objects/loyalty-settings.js";
import { earningFor, type EarnableOrder } from "../order-earning.js";

const OPEN: LoyaltySettingsInput = {
  pointsPerStep: 1_000,
  stepValueCents: 500,
  openToPublic: true,
  openToPro: false,
  voucherValidityDays: 365,
};
const PUBLIC_ONLY = LoyaltySettings.of(OPEN);
const BOTH = LoyaltySettings.of({ ...OPEN, openToPro: true });

const PUBLIC_ORDER: EarnableOrder = {
  orderId: "o1",
  orderNumber: "CMD-1",
  clientele: "public",
  companyId: null,
  placedByUserId: "u1",
  buyerHasAccount: true,
  subtotalCents: 2_340,
  discountCents: 0,
};
const PRO_ORDER: EarnableOrder = { ...PUBLIC_ORDER, clientele: "pro", companyId: "c1" };

describe("earningFor — ce que rapporte une commande définitive, et à qui", () => {
  it("un centime d'assiette vaut un point, à la personne pour le public", () => {
    expect(earningFor(PUBLIC_ORDER, PUBLIC_ONLY)).toEqual({
      kind: "earn",
      holder: LoyaltyHolder.of("user", "u1"),
      points: 2_340,
    });
  });

  /**
   * L'assiette est hors taxe : un crédit calculé sur le TTC rendrait au client,
   * en points, la TVA qu'on reverse à l'État (décision du 2026-09-26).
   */
  it("compte le hors taxe des marchandises, remise déduite", () => {
    const order = { ...PUBLIC_ORDER, subtotalCents: 2_500, discountCents: 160 };
    expect(earningFor(order, PUBLIC_ONLY)).toMatchObject({ kind: "earn", points: 2_340 });
  });

  it("crédite la société pour un pro, quand la clientèle pro est ouverte", () => {
    expect(earningFor(PRO_ORDER, BOTH)).toMatchObject({
      kind: "earn",
      holder: LoyaltyHolder.of("company", "c1"),
    });
  });

  it.each([
    ["le programme est fermé", PUBLIC_ORDER, null, "program_closed"],
    ["la clientèle pro est fermée", PRO_ORDER, PUBLIC_ONLY, "clientele_closed"],
    ["la société a été supprimée", { ...PRO_ORDER, companyId: null }, BOTH, "company_missing"],
    ["l'acheteur est un invité", { ...PUBLIC_ORDER, buyerHasAccount: false }, BOTH, "guest_buyer"],
    [
      "la remise couvre tout",
      { ...PUBLIC_ORDER, subtotalCents: 700, discountCents: 700 },
      BOTH,
      "empty_basis",
    ],
  ] as const)("ne rapporte rien quand %s", (_case, order, settings, reason) => {
    expect(earningFor(order, settings)).toEqual({ kind: "skip", reason });
  });
});
