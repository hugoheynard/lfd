import { orderOpeningExemptionPayloadSchema } from "../order-opening-exemptions.js";

/** La forme d'un ajout d'exemption : une société OU une adresse (2026-10-26). */
describe("orderOpeningExemptionPayloadSchema", () => {
  it("accepte une société et une adresse", () => {
    expect(
      orderOpeningExemptionPayloadSchema.safeParse({ kind: "company", companyId: "c1" }).success,
    ).toBe(true);
    expect(
      orderOpeningExemptionPayloadSchema.safeParse({ kind: "email", email: "a@b.fr" }).success,
    ).toBe(true);
  });

  it("refuse une cible vide ou sans genre", () => {
    expect(
      orderOpeningExemptionPayloadSchema.safeParse({ kind: "email", email: " " }).success,
    ).toBe(false);
    expect(orderOpeningExemptionPayloadSchema.safeParse({ companyId: "c1" }).success).toBe(false);
  });
});
