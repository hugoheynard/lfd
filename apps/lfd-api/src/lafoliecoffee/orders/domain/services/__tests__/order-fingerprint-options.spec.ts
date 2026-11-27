import { createHash } from "node:crypto";

import { orderFingerprint, type OrderFingerprintMaterial } from "../order-fingerprint.js";

const BASKET: OrderFingerprintMaterial = {
  fulfillmentMethod: "pickup",
  pickupAddressId: "pickup_1",
  deliveryAddressId: null,
  deliveryAddress: null,
  requestedDeliveryDate: "2026-09-01",
  lines: [
    { sku: "PAIN-CAMP", quantity: 4 },
    { sku: "VIE-001", quantity: 2 },
  ],
};

/** Le matériau tel que l'empreinte l'écrivait avant les options, recopié à la main. */
const MATERIAL_BEFORE_OPTIONS = JSON.stringify({
  companyId: "co_1",
  method: "pickup",
  pickupAddressId: "pickup_1",
  deliveryAddressId: null,
  deliveryAddress: null,
  requestedDeliveryDate: "2026-09-01",
  lines: ["PAIN-CAMP:4", "VIE-001:2"],
});

describe("orderFingerprint — les options (« dont 2 tranchés »)", () => {
  it("🔴 un panier sans option garde son empreinte octet pour octet — une clé en vol reste un rejeu", () => {
    const before = createHash("sha256").update(MATERIAL_BEFORE_OPTIONS).digest("hex");

    expect(orderFingerprint(BASKET, "co_1")).toBe(before);
    expect(
      orderFingerprint(
        { ...BASKET, lines: BASKET.lines.map((line) => ({ ...line, optionChoices: [] })) },
        "co_1",
      ),
    ).toBe(before);
  });

  it("des options changent l'empreinte", () => {
    const sliced = {
      ...BASKET,
      lines: [
        {
          sku: "PAIN-CAMP",
          quantity: 4,
          optionChoices: [{ group: "g", choice: "c", quantity: 2 }],
        },
      ],
    };
    const bare = { ...BASKET, lines: [{ sku: "PAIN-CAMP", quantity: 4 }] };

    expect(orderFingerprint(sliced, null)).not.toBe(orderFingerprint(bare, null));
  });

  it("deux quantités d'option différentes font deux empreintes", () => {
    const withCount = (quantity: number) => ({
      ...BASKET,
      lines: [
        { sku: "PAIN-CAMP", quantity: 4, optionChoices: [{ group: "g", choice: "c", quantity }] },
      ],
    });

    expect(orderFingerprint(withCount(1), null)).not.toBe(orderFingerprint(withCount(2), null));
  });

  it("l'ordre des options ne compte pas", () => {
    const a = { group: "slicing", choice: "sliced", quantity: 2 };
    const b = { group: "wrap", choice: "wrapped", quantity: 1 };
    const order = (options: readonly (typeof a)[]) => ({
      ...BASKET,
      lines: [{ sku: "PAIN-CAMP", quantity: 4, optionChoices: options }],
    });

    expect(orderFingerprint(order([a, b]), null)).toBe(orderFingerprint(order([b, a]), null));
  });
});
