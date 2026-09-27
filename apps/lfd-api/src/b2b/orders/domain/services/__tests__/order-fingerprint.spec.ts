import { orderFingerprint, type OrderFingerprintMaterial } from "../order-fingerprint.js";

const BASKET: OrderFingerprintMaterial = {
  fulfillmentMethod: "pickup",
  pickupAddressId: "pickup_1",
  deliveryAddressId: null,
  deliveryAddress: null,
  requestedDeliveryDate: "2026-09-01",
  lines: [{ sku: "VIE-001", quantity: 2 }],
};

describe("orderFingerprint — le bon de fidélité", () => {
  /**
   * Plan des points, §11 bis S5 : sans le bon dans l'empreinte, rejouer la clé
   * avec un AUTRE bon rendrait la première commande comme un rejeu.
   */
  it("deux bons différents font deux empreintes", () => {
    expect(orderFingerprint({ ...BASKET, voucherId: "v1" }, null)).not.toBe(
      orderFingerprint({ ...BASKET, voucherId: "v2" }, null),
    );
  });

  it("un bon, ou aucun, font deux empreintes", () => {
    expect(orderFingerprint({ ...BASKET, voucherId: "v1" }, null)).not.toBe(
      orderFingerprint(BASKET, null),
    );
  });

  /** Une clé en vol au déploiement reste un rejeu : sans bon, l'empreinte ne change pas de forme. */
  it("sans bon, l'empreinte est celle d'avant le lot C", () => {
    expect(orderFingerprint(BASKET, null)).toBe(
      orderFingerprint({ ...BASKET, voucherId: undefined }, null),
    );
  });

  it("les lignes réordonnées gardent la même empreinte", () => {
    const two = {
      ...BASKET,
      lines: [
        { sku: "A", quantity: 1 },
        { sku: "B", quantity: 2 },
      ],
    };
    const swapped = {
      ...BASKET,
      lines: [
        { sku: "B", quantity: 2 },
        { sku: "A", quantity: 1 },
      ],
    };
    expect(orderFingerprint(two, null)).toBe(orderFingerprint(swapped, null));
  });
});
