import { adminPlaceOrderPayloadSchema } from "../admin-order.js";
import { placeOrderPayloadSchema } from "../order.js";
import { SALES_TERMS_REQUIRED_MESSAGE } from "../sales-terms-acceptance.values.js";
import { placeShopOrderPayloadSchema } from "../shop-order.js";

/**
 * La case des CGV au panier (2026-10-26) : le champ est REQUIS sur les deux
 * passations du client, `null` y dit « rien à cocher », et la saisie du staff
 * ne le porte pas.
 */
const CONTENT = {
  idempotencyKey: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  fulfillmentMethod: "pickup",
  pickupAddressId: "pickup_1",
  requestedDeliveryDate: "2026-12-24",
  lines: [{ sku: "VIE-001", quantity: 2 }],
};
const GUEST = { buyer: { firstName: "Camille", email: "c@exemple.fr", phone: "0600000000" } };

function messagesOf(result: { error?: { issues: readonly { message: string }[] } }): string[] {
  return (result.error?.issues ?? []).map((issue) => issue.message);
}

describe("les CGV acceptées au contrat de passation", () => {
  it("porte le texte et la révision cochés", () => {
    const parsed = placeOrderPayloadSchema.parse({
      ...CONTENT,
      salesTerms: { key: "salesTermsPro", revision: 4 },
    });
    expect(parsed.salesTerms).toEqual({ key: "salesTermsPro", revision: 4 });
  });

  it("admet `null` : rien à cocher", () => {
    expect(placeOrderPayloadSchema.parse({ ...CONTENT, salesTerms: null }).salesTerms).toBeNull();
  });

  it("un corps sans le champ est refusé avec le message lisible", () => {
    const result = placeOrderPayloadSchema.safeParse(CONTENT);
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain(SALES_TERMS_REQUIRED_MESSAGE);
  });

  it("la boutique sans compte l'exige aussi", () => {
    const result = placeShopOrderPayloadSchema.safeParse({ ...CONTENT, ...GUEST });
    expect(messagesOf(result)).toContain(SALES_TERMS_REQUIRED_MESSAGE);
    expect(
      placeShopOrderPayloadSchema.parse({ ...CONTENT, ...GUEST, salesTerms: null }).salesTerms,
    ).toBeNull();
  });

  it.each([
    ["un texte inconnu", { key: "privacy", revision: 1 }],
    ["une révision nulle", { key: "salesTerms", revision: 0 }],
    ["une révision décimale", { key: "salesTerms", revision: 1.5 }],
  ])("refuse %s", (_, salesTerms) => {
    expect(placeOrderPayloadSchema.safeParse({ ...CONTENT, salesTerms }).success).toBe(false);
  });

  it("la saisie du staff ne le porte pas", () => {
    const parsed = adminPlaceOrderPayloadSchema.parse({
      ...CONTENT,
      companyId: "c1",
      buyerUserId: "u1",
      settlement: "account",
      requestedWindow: { start: "07:00", end: "08:00" },
      salesTerms: { key: "salesTerms", revision: 1 },
    });
    expect("salesTerms" in parsed).toBe(false);
  });
});
