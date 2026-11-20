import { Order } from "../../../../domain/entities/order.js";
import { ShopTillOrderRevisedToDeliveryError } from "../../errors/shop-till-revision.error.js";
import { DELIVERY } from "../../entities/__tests__/order-revision-promotion.fixture.js";
import { line, placed, revised } from "../../entities/__tests__/revisable-order.fixture.js";
import { ensureShopTillStaysPickup } from "../shop-till-revision.js";

/**
 * Une commande à régler à la caisse de la boutique se retire : aucune
 * révision ne la fait passer en livraison
 * (`plan-commande-particulier-reglee-en-boutique.md`, § 5).
 */
describe("ensureShopTillStaysPickup", () => {
  it("refuse une livraison sur une commande à régler en boutique", () => {
    expect(() => ensureShopTillStaysPickup({ settlementVenue: "shop_till" }, "delivery")).toThrow(
      ShopTillOrderRevisedToDeliveryError,
    );
  });

  it("laisse un retrait à régler en boutique se réviser", () => {
    expect(() =>
      ensureShopTillStaysPickup({ settlementVenue: "shop_till" }, "pickup"),
    ).not.toThrow();
  });

  it("ne concerne pas les autres commandes", () => {
    expect(() => ensureShopTillStaysPickup({ settlementVenue: null }, "delivery")).not.toThrow();
  });
});

describe("Order.revise — une commande à régler en boutique", () => {
  const shopTill = () =>
    placed({ companyId: null, billedCompanyId: null, settlementVenue: "shop_till" });

  it("refuse le passage en livraison, avec un code nommé", () => {
    const order = shopTill();
    const attempt = () =>
      Order.revise(
        order,
        revised(order, { companyId: null, billedCompanyId: null, fulfillment: DELIVERY }),
      );

    expect(attempt).toThrow(ShopTillOrderRevisedToDeliveryError);
    expect(attempt).toThrow(/ne peut pas passer en livraison/u);
  });

  it("garde un retrait révisé, et ne le porte jamais au compte", () => {
    const order = shopTill();
    const { revision } = Order.revise(
      order,
      revised(order, { companyId: null, billedCompanyId: null, lines: [line("VIE-001", 12)] }),
    );

    expect(revision.state.fulfillmentMethod).toBe("pickup");
    expect(revision.onAccount).toBe(false);
  });
});
