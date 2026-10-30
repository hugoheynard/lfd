import { checkJournalFact, journalPayloadShapes } from "../index.js";

/**
 * Le lieu de retrait cité avec son nom du moment (décision de Hugo du
 * 2026-10-30, §7 du plan des phrases) : la préférence d'acheminement et le
 * panier supprimé portent `pickupAddress`, et les lignes d'avant, qui ne
 * portaient que `pickupAddressId`, restent lisibles sans plus s'écrire.
 */
describe("le point de retrait nommé des comptes et des paniers", () => {
  const preference = {
    subjectLabel: "Café des Halles",
    method: "pickup",
    deliveryAddress: null,
    signatureRequired: false,
  };
  const subscription = {
    recurrence: "weekly",
    status: "active",
    startDate: "2026-09-01",
    endDate: null,
    fulfillmentMethod: "pickup",
    lines: [{ sku: "VIE-001-1", quantity: 2 }],
  };

  it("écrit la préférence avec le point nommé, nu, ou absent", () => {
    for (const pickupAddress of [{ id: "pa_1", name: "Boutique Oberkampf" }, "pa_1", null]) {
      expect(
        checkJournalFact("company.fulfillment_preference_set", { ...preference, pickupAddress }),
      ).toBeNull();
    }
  });

  it("écrit le panier supprimé avec le point nommé", () => {
    expect(
      checkJournalFact("subscription.deleted", {
        ...subscription,
        pickupAddress: { id: "pa_1", name: "Boutique Oberkampf" },
      }),
    ).toBeNull();
  });

  it("lit encore les lignes d'avant, qui ne s'écrivent plus", () => {
    const before = [
      ["company.fulfillment_preference_set", { ...preference, pickupAddressId: "pa_1" }],
      ["subscription.deleted", { ...subscription, pickupAddressId: "pa_1" }],
    ] as const;
    for (const [type, line] of before) {
      expect(journalPayloadShapes(type).some((shape) => shape.safeParse(line).success)).toBe(true);
      expect(checkJournalFact(type, line)).toMatchObject({ kind: "invalid_payload" });
    }
  });
});
