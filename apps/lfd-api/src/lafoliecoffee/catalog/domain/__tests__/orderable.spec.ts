import { isOrderable, isReservedElsewhere, unorderableCause } from "../orderable.js";

/** La seule lecture des marques (`carte-des-sites.md`, § 3.4). */
describe("isOrderable", () => {
  it.each([
    ["none", "on", true],
    ["mine", "on", true],
    ["reserved", "on", true],
    ["other", "on", false],
    ["none", "off", false],
    ["mine", "off", false],
    ["other", "off", false],
  ] as const)("réservation %s, carte %s → %s", (reservation, menu, expected) => {
    expect(isOrderable({ reservation, menu })).toBe(expected);
  });

  it("la réservation se dit d'abord, la carte ensuite", () => {
    expect(unorderableCause({ reservation: "other", menu: "off" })).toBe("reserved_elsewhere");
    expect(unorderableCause({ reservation: "none", menu: "off" })).toBe("off_menu");
    expect(unorderableCause({ reservation: "none", menu: "on" })).toBeNull();
  });

  it("« réservé ailleurs » ignore la carte : une mercuriale y reste permise (§ 3.6)", () => {
    expect(isReservedElsewhere({ reservation: "none" })).toBe(false);
    expect(isReservedElsewhere({ reservation: "other" })).toBe(true);
  });
});
