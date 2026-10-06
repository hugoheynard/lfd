import { InvalidGeoPointError } from "../../errors/delivery-routing-errors.js";
import { AddressSuggestionDecision } from "../address-suggestion-decision.js";

/** **Ce que le bureau décide d'une suggestion** (§6) — un fait daté, signé. */
const INPUT = {
  id: "d1",
  addressId: "a1",
  kind: "door" as const,
  point: { lat: 45.566, lng: 5.918 },
  at: new Date(0),
  author: { staffUserId: "staff_ana", name: "Ana Martin" },
};

describe("AddressSuggestionDecision", () => {
  it("« Ignorer » et « Appliquer » s'écrivent avec leur auteur et le point vu", () => {
    expect(AddressSuggestionDecision.ignore(INPUT).toSnapshot()).toEqual({
      id: "d1",
      addressId: "a1",
      kind: "door",
      outcome: "ignored",
      point: { lat: 45.566, lng: 5.918 },
      decidedAt: new Date(0),
      decidedBy: "staff_ana",
      decidedByName: "Ana Martin",
    });
    expect(AddressSuggestionDecision.apply(INPUT).toSnapshot().outcome).toBe("applied");
  });

  it("refuse un point hors des bornes terrestres", () => {
    expect(() =>
      AddressSuggestionDecision.ignore({ ...INPUT, point: { lat: 95, lng: 0 } }),
    ).toThrow(InvalidGeoPointError);
  });
});
