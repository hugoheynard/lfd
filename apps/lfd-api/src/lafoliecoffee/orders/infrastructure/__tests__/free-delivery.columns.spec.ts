import { Prisma } from "../../../../platform/database/client/client.js";
import { freeDeliveryColumnsOf, freeDeliveryOfRow } from "../free-delivery.columns.js";
import { FrozenAdjustmentUnreadableError } from "../frozen-adjustment-unreadable.error.js";

const NO_PROMOTION = {
  freeDeliveryPromotionId: null,
  freeDeliveryPromotionThresholdCents: null,
  freeDeliveryLabel: null,
} as const;

const LABEL = { fr: "Client fidèle", en: "Loyal customer", it: "Cliente fedele" };

describe("freeDeliveryOfRow — les colonnes de la livraison offerte figée", () => {
  it("toutes les colonnes nulles : pas de livraison offerte", () => {
    expect(
      freeDeliveryOfRow("o1", {
        freeDeliveryThresholdCents: null,
        freeDeliveryWaivedCents: null,
        freeDeliveryWaivedTtcCents: null,
        ...NO_PROMOTION,
      }),
    ).toBeNull();
  });

  it("le seuil et le montant : le franco de la route, TTC compris s'il est figé", () => {
    expect(
      freeDeliveryOfRow("o1", {
        freeDeliveryThresholdCents: 8_000,
        freeDeliveryWaivedCents: 1_250,
        freeDeliveryWaivedTtcCents: 1_500,
        ...NO_PROMOTION,
      }),
    ).toEqual({
      thresholdCents: 8_000,
      waivedCents: 1_250,
      waivedTtcCents: 1_500,
      promotion: null,
    });
  });

  it("offerte par une promotion sans franco de route : le seuil de route reste nul", () => {
    expect(
      freeDeliveryOfRow("o1", {
        freeDeliveryThresholdCents: null,
        freeDeliveryWaivedCents: 1_250,
        freeDeliveryWaivedTtcCents: null,
        freeDeliveryPromotionId: "promo-1",
        freeDeliveryPromotionThresholdCents: 0,
        freeDeliveryLabel: LABEL,
      }),
    ).toEqual({
      thresholdCents: null,
      waivedCents: 1_250,
      waivedTtcCents: null,
      promotion: { promotionId: "promo-1", thresholdCents: 0, label: LABEL },
    });
  });

  it("un seuil sans montant : une ligne écrite hors de l'application, refusée", () => {
    expect(() =>
      freeDeliveryOfRow("o1", {
        freeDeliveryThresholdCents: 8_000,
        freeDeliveryWaivedCents: null,
        freeDeliveryWaivedTtcCents: null,
        ...NO_PROMOTION,
      }),
    ).toThrow(FrozenAdjustmentUnreadableError);
  });

  it("un montant offert que personne n'offre : refusé", () => {
    expect(() =>
      freeDeliveryOfRow("o1", {
        freeDeliveryThresholdCents: null,
        freeDeliveryWaivedCents: 1_250,
        freeDeliveryWaivedTtcCents: null,
        ...NO_PROMOTION,
      }),
    ).toThrow(FrozenAdjustmentUnreadableError);
  });

  it("une promotion sans son libellé : refusée", () => {
    expect(() =>
      freeDeliveryOfRow("o1", {
        freeDeliveryThresholdCents: null,
        freeDeliveryWaivedCents: 1_250,
        freeDeliveryWaivedTtcCents: null,
        freeDeliveryPromotionId: "promo-1",
        freeDeliveryPromotionThresholdCents: 0,
        freeDeliveryLabel: null,
      }),
    ).toThrow(FrozenAdjustmentUnreadableError);
  });
});

describe("freeDeliveryColumnsOf — l'écriture", () => {
  it("sans livraison offerte : tout à NULL, libellé compris", () => {
    expect(freeDeliveryColumnsOf(null)).toEqual({
      freeDeliveryThresholdCents: null,
      freeDeliveryWaivedCents: null,
      freeDeliveryWaivedTtcCents: null,
      freeDeliveryPromotionId: null,
      freeDeliveryPromotionThresholdCents: null,
      freeDeliveryLabel: Prisma.DbNull,
    });
  });

  it("offerte par une promotion : ses trois colonnes, et le seuil de la route tel quel", () => {
    expect(
      freeDeliveryColumnsOf({
        thresholdCents: 8_000,
        waivedCents: 1_250,
        waivedTtcCents: null,
        promotion: { promotionId: "promo-1", thresholdCents: 5_000, label: LABEL },
      }),
    ).toEqual({
      freeDeliveryThresholdCents: 8_000,
      freeDeliveryWaivedCents: 1_250,
      freeDeliveryWaivedTtcCents: null,
      freeDeliveryPromotionId: "promo-1",
      freeDeliveryPromotionThresholdCents: 5_000,
      freeDeliveryLabel: LABEL,
    });
  });
});
