import { freeDeliveryOfRow } from "../free-delivery.columns.js";
import { FrozenAdjustmentUnreadableError } from "../frozen-adjustment-unreadable.error.js";

describe("freeDeliveryOfRow — les colonnes du franco figé", () => {
  it("trois colonnes nulles : pas de franco", () => {
    expect(
      freeDeliveryOfRow("o1", {
        freeDeliveryThresholdCents: null,
        freeDeliveryWaivedCents: null,
        freeDeliveryWaivedTtcCents: null,
      }),
    ).toBeNull();
  });

  it("le seuil et le montant : le franco, TTC compris s'il est figé", () => {
    expect(
      freeDeliveryOfRow("o1", {
        freeDeliveryThresholdCents: 8_000,
        freeDeliveryWaivedCents: 1_250,
        freeDeliveryWaivedTtcCents: 1_500,
      }),
    ).toEqual({ thresholdCents: 8_000, waivedCents: 1_250, waivedTtcCents: 1_500 });
  });

  it("un seuil sans montant : une ligne écrite hors de l'application, refusée", () => {
    expect(() =>
      freeDeliveryOfRow("o1", {
        freeDeliveryThresholdCents: 8_000,
        freeDeliveryWaivedCents: null,
        freeDeliveryWaivedTtcCents: null,
      }),
    ).toThrow(FrozenAdjustmentUnreadableError);
  });
});
