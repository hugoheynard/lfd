import { describe, expect, it } from "@jest/globals";

import {
  offeredParticularOrderEstimatePayloadSchema,
  offeredParticularOrderPayloadSchema,
} from "../offered-particular-order.js";

const pickup = {
  buyerUserId: "u_particular",
  offer: { nature: "event", note: "Dégustation pour un mariage" },
  fulfillmentMethod: "pickup",
  pickupAddressId: "pa_1",
  requestedDeliveryDate: "2030-01-15",
  requestedWindow: { start: "08:00", end: "09:00" },
  lines: [{ sku: "SKU-1", quantity: 1 }],
  expectedTotalCents: 0,
};

describe("contrat de la commande offerte à un particulier", () => {
  it("admet un retrait avec son motif, et ne prévient pas le client par défaut", () => {
    const parsed = offeredParticularOrderPayloadSchema.parse(pickup);
    expect(parsed.offer.notifyCustomer).toBe(false);
  });

  it("exige le motif : la route offre toujours", () => {
    expect(
      offeredParticularOrderPayloadSchema.safeParse({ ...pickup, offer: undefined }).success,
    ).toBe(false);
  });

  it("refuse un motif vide", () => {
    const empty = { ...pickup, offer: { nature: "event", note: "  " } };
    expect(offeredParticularOrderPayloadSchema.safeParse(empty).success).toBe(false);
  });

  it("refuse une livraison sans adresse, et un retrait sans créneau", () => {
    const delivery = { ...pickup, fulfillmentMethod: "delivery", pickupAddressId: null };
    expect(offeredParticularOrderPayloadSchema.safeParse(delivery).success).toBe(false);
    const noWindow = { ...pickup, requestedWindow: undefined };
    expect(offeredParticularOrderPayloadSchema.safeParse(noWindow).success).toBe(false);
  });

  it("n'accepte pas de société : le champ est ignoré, jamais lu", () => {
    const parsed = offeredParticularOrderPayloadSchema.parse({ ...pickup, companyId: "c_1" });
    expect("companyId" in parsed).toBe(false);
  });
});

describe("contrat de l'estimation de la commande offerte à un particulier", () => {
  // Sans total vu : le champ n'est pas au contrat de l'estimation.
  const estimate = { ...pickup, expectedTotalCents: undefined };

  it("admet un panier sans motif : l'écran estime avant que le motif soit écrit", () => {
    const parsed = offeredParticularOrderEstimatePayloadSchema.parse({
      ...estimate,
      offer: undefined,
    });
    expect(parsed.offer).toBeUndefined();
  });

  it("refuse un motif vide quand il est donné", () => {
    const empty = { ...estimate, offer: { nature: "event", note: " " } };
    expect(offeredParticularOrderEstimatePayloadSchema.safeParse(empty).success).toBe(false);
  });

  it("refuse une livraison sans adresse, comme la passation", () => {
    const delivery = { ...estimate, fulfillmentMethod: "delivery", pickupAddressId: null };
    expect(offeredParticularOrderEstimatePayloadSchema.safeParse(delivery).success).toBe(false);
  });
});
