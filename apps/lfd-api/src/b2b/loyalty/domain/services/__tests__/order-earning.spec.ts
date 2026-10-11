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
  placedAt: new Date("2026-03-01T10:00:00.000Z"),
  clientele: "public",
  companyId: null,
  placedByUserId: "u1",
  buyerHasAccount: true,
  subtotalCents: 2_340,
  discountCents: 0,
  voucherDiscountCents: 0,
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

  /** Plan C6, tranché par Hugo le 2026-09-27 : un point dépensé ne rapporte pas de point. */
  it("déduit la remise ET le bon de fidélité de l'assiette", () => {
    const order = {
      ...PUBLIC_ORDER,
      subtotalCents: 2_500,
      discountCents: 160,
      voucherDiscountCents: 500,
    };
    expect(earningFor(order, PUBLIC_ONLY)).toMatchObject({ kind: "earn", points: 1_840 });
  });

  it("ne rapporte rien quand le bon couvre toutes les marchandises", () => {
    const order = { ...PUBLIC_ORDER, subtotalCents: 700, voucherDiscountCents: 700 };
    expect(earningFor(order, PUBLIC_ONLY)).toEqual({ kind: "skip", reason: "empty_basis" });
  });

  /**
   * R4 du plan bienvenue : une commande passée programme fermé au public ne se
   * crédite pas d'un coup, au barème du jour. Les dates ne sont comparées
   * qu'entre elles, jamais à l'horloge.
   */
  describe("avant l'ouverture au public (R4)", () => {
    const OPENED_AT = PUBLIC_ORDER.placedAt;
    const OPENED = LoyaltySettings.of(
      { ...OPEN, openToPro: true },
      { publicOpenedAt: OPENED_AT, welcomeBonusSince: null },
    );
    const before = new Date(OPENED_AT.getTime() - 1);

    it("ne rapporte rien pour une commande de particulier passée avant", () => {
      expect(earningFor({ ...PUBLIC_ORDER, placedAt: before }, OPENED)).toEqual({
        kind: "skip",
        reason: "before_program",
      });
    });

    it("crédite une commande passée à l'instant même de l'ouverture, ou après", () => {
      expect(earningFor(PUBLIC_ORDER, OPENED)).toMatchObject({ kind: "earn", points: 2_340 });
    });

    it("ne borne pas une commande pro : le jalon est celui du public", () => {
      expect(earningFor({ ...PRO_ORDER, placedAt: before }, OPENED)).toMatchObject({
        kind: "earn",
      });
    });

    it("dit d'abord qu'un invité est un invité", () => {
      expect(
        earningFor({ ...PUBLIC_ORDER, placedAt: before, buyerHasAccount: false }, OPENED),
      ).toEqual({ kind: "skip", reason: "guest_buyer" });
    });
  });
});
