import { addressPointDecisionPayloadSchema } from "../delivery-address-suggestions.js";

/** Appliquer / ignorer une suggestion du carnet (§6) : le genre et le point VU. */
describe("addressPointDecisionPayloadSchema", () => {
  it("accepte la porte ou le stationnement, avec un point terrestre", () => {
    for (const kind of ["door", "parking"]) {
      expect(
        addressPointDecisionPayloadSchema.safeParse({ kind, point: { lat: 45.6, lng: 6.1 } })
          .success,
      ).toBe(true);
    }
  });

  it("refuse un autre genre, un point hors bornes, un point absent", () => {
    const point = { lat: 45.6, lng: 6.1 };
    expect(addressPointDecisionPayloadSchema.safeParse({ kind: "entrance", point }).success).toBe(
      false,
    );
    expect(
      addressPointDecisionPayloadSchema.safeParse({ kind: "door", point: { lat: 91, lng: 0 } })
        .success,
    ).toBe(false);
    expect(addressPointDecisionPayloadSchema.safeParse({ kind: "door" }).success).toBe(false);
  });
});
