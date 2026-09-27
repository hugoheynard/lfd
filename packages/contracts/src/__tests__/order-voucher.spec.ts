import { adminPlaceOrderPayloadSchema } from "../admin-order.js";
import { placeOrderPayloadSchema } from "../order.js";
import { placeShopOrderPayloadSchema } from "../shop-order.js";

/**
 * Qui peut **nommer** un bon de fidélité à la commande (plan des points, C3) :
 * le client connecté, et lui seul. L'invité n'a pas de bons ; le staff ne
 * dépense pas celui d'un client. Leurs contrats n'ont pas le champ, et Zod le
 * RETIRE — un bon glissé dans leur corps n'arrive jamais au handler.
 */
const WITHOUT_VOUCHER = {
  fulfillmentMethod: "pickup",
  pickupAddressId: "pickup_1",
  requestedDeliveryDate: "2026-12-24",
  lines: [{ sku: "VIE-001", quantity: 2 }],
};
const CONTENT = { ...WITHOUT_VOUCHER, voucherId: "v1" };

describe("le bon de fidélité au contrat de passation", () => {
  it("le client connecté le porte", () => {
    const parsed = placeOrderPayloadSchema.parse({
      ...CONTENT,
      idempotencyKey: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    });
    expect(parsed.voucherId).toBe("v1");
  });

  it("son absence reste une commande sans bon", () => {
    const parsed = placeOrderPayloadSchema.parse({
      ...WITHOUT_VOUCHER,
      idempotencyKey: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    });
    expect("voucherId" in parsed).toBe(false);
  });

  it("l'invité ne peut pas en nommer : le champ est retiré", () => {
    const parsed = placeShopOrderPayloadSchema.parse({
      ...CONTENT,
      idempotencyKey: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      buyer: { firstName: "Camille", email: "camille@exemple.fr", phone: "0600000000" },
    });
    expect("voucherId" in parsed).toBe(false);
  });

  it("le staff ne peut pas en nommer pour un client : le champ est retiré", () => {
    const parsed = adminPlaceOrderPayloadSchema.parse({
      ...CONTENT,
      companyId: "c1",
      buyerUserId: "u1",
      settlement: "link",
      requestedWindow: { start: "08:00", end: "09:00" },
    });
    expect("voucherId" in parsed).toBe(false);
  });
});
