import { adminPlaceOrderPayloadSchema } from "../admin-order.js";
import { placeOrderPayloadSchema } from "../order.js";

/**
 * La langue de la commande (lot A3) : le client connecté la porte ; la saisie
 * du staff n'a pas le champ, et Zod le RETIRE — la langue d'un écran du
 * back-office ne dit rien du client.
 */
const CONTENT = {
  fulfillmentMethod: "pickup",
  pickupAddressId: "pickup_1",
  requestedDeliveryDate: "2026-12-24",
  lines: [{ sku: "VIE-001", quantity: 2 }],
  locale: "en",
};

describe("la langue au contrat de passation", () => {
  it("le client connecté la porte", () => {
    const parsed = placeOrderPayloadSchema.parse({
      ...CONTENT,
      idempotencyKey: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    });
    expect(parsed.locale).toBe("en");
  });

  it("refuse une langue que la boutique ne propose pas", () => {
    expect(() =>
      placeOrderPayloadSchema.parse({
        ...CONTENT,
        locale: "es",
        idempotencyKey: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      }),
    ).toThrow();
  });

  it("le staff ne peut pas en poser : le champ est retiré", () => {
    const parsed = adminPlaceOrderPayloadSchema.parse({
      ...CONTENT,
      companyId: "c1",
      buyerUserId: "u1",
      settlement: "account",
      requestedWindow: { start: "07:00", end: "08:00" },
    });
    expect("locale" in parsed).toBe(false);
  });
});
