import { invoiceFreeDeliveryOfOrder } from "../invoice-free-delivery.columns.js";

/** La livraison offerte de la commande, relue pour être figée sur la facture (§ 2.9). */
describe("invoiceFreeDeliveryOfOrder", () => {
  const label = { fr: "Client fidèle", en: "Loyal customer", it: "Cliente fedele" };

  it("rien d'offert : null", () => {
    expect(
      invoiceFreeDeliveryOfOrder({
        freeDeliveryWaivedCents: null,
        freeDeliveryWaivedTtcCents: null,
        freeDeliveryLabel: null,
      }),
    ).toBeNull();
  });

  it("le franco de la route : le barème offert, sans libellé", () => {
    expect(
      invoiceFreeDeliveryOfOrder({
        freeDeliveryWaivedCents: 2_400,
        freeDeliveryWaivedTtcCents: 2_880,
        freeDeliveryLabel: null,
      }),
    ).toEqual({ waivedCents: 2_400, waivedTtcCents: 2_880 });
  });

  it("une promotion : son libellé figé, dans ses trois langues", () => {
    expect(
      invoiceFreeDeliveryOfOrder({
        freeDeliveryWaivedCents: 1_500,
        freeDeliveryWaivedTtcCents: null,
        freeDeliveryLabel: label,
      }),
    ).toEqual({ waivedCents: 1_500, waivedTtcCents: null, label });
  });

  it("un libellé illisible se tait : la mention dit « Livraison offerte »", () => {
    expect(
      invoiceFreeDeliveryOfOrder({
        freeDeliveryWaivedCents: 1_500,
        freeDeliveryWaivedTtcCents: null,
        freeDeliveryLabel: { fr: 3 },
      }),
    ).toEqual({ waivedCents: 1_500, waivedTtcCents: null });
  });
});
