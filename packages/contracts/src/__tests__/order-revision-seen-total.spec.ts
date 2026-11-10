import { orderChangeApplyPayloadSchema, orderChangeRequestPayloadSchema } from "../contact.js";
import { orderRevisionPayloadSchema } from "../order-revision.js";

/**
 * **Le total vu, sur toute modification** (plan
 * `documentation/commandes/modification/plan-s2-la-hausse.md`, R14) : la
 * modification et l'application d'une demande portent le TTC vu ; la demande
 * du client, qui ne modifie rien, ne le porte pas.
 */
const WANTED = {
  fulfillmentMethod: "pickup",
  pickupAddressId: "pa_1",
  deliveryAddress: null,
  requestedDeliveryDate: "2030-01-02",
  lines: [{ sku: "VIE-001", quantity: 10 }],
} as const;

describe("orderRevisionPayloadSchema — le total vu", () => {
  it("exige le total vu", () => {
    expect(orderRevisionPayloadSchema.safeParse({ expectedRevision: 0, ...WANTED }).success).toBe(
      false,
    );
  });

  it("accepte un nombre entier de centimes, refuse un négatif ou une fraction", () => {
    const at = (expectedTotalCents: number) =>
      orderRevisionPayloadSchema.safeParse({ expectedRevision: 0, expectedTotalCents, ...WANTED })
        .success;
    expect(at(3798)).toBe(true);
    expect(at(-1)).toBe(false);
    expect(at(37.98)).toBe(false);
  });
});

describe("orderChangeRequestPayloadSchema — la demande ne porte pas de total", () => {
  it("accepte la composition sans total vu, et ne le garde pas", () => {
    const parsed = orderChangeRequestPayloadSchema.parse({
      change: { expectedRevision: 0, ...WANTED },
    });
    expect(parsed.change).not.toHaveProperty("expectedTotalCents");
  });
});

describe("orderChangeApplyPayloadSchema — le total vu par l'équipe", () => {
  it("exige le total, et rien d'autre", () => {
    expect(orderChangeApplyPayloadSchema.safeParse({}).success).toBe(false);
    expect(orderChangeApplyPayloadSchema.safeParse({ expectedTotalCents: 4250 }).success).toBe(
      true,
    );
    expect(
      orderChangeApplyPayloadSchema.safeParse({ expectedTotalCents: 4250, extra: 1 }).success,
    ).toBe(false);
  });
});
