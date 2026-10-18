import { ACTIVITY_FAMILIES, activityFamilyOf } from "../activity-families.js";

describe("le regroupement NAF en familles d'activité (proposition A1, Q4)", () => {
  it.each([
    ["55.10Z", "hospitality"],
    ["55.20Z", "hospitality"],
    ["56.10A", "restaurant"],
    ["56.10C", "restaurant"],
    ["56.21Z", "restaurant"],
    ["56.29B", "restaurant"],
    ["56.30Z", "cafe_bar"],
    ["47.11B", "food_retail"],
    ["47.24Z", "food_retail"],
    ["10.71C", "food_retail"],
    ["62.01Z", "other"],
    ["47.71Z", "other"],
  ])("range %s en %s", (naf, family) => {
    expect(activityFamilyOf(naf)).toBe(family);
  });

  it("lit le code sans point, en minuscules ou entouré d'espaces", () => {
    expect(activityFamilyOf("5630Z")).toBe("cafe_bar");
    expect(activityFamilyOf(" 56.10a ")).toBe("restaurant");
  });

  it("range un code vide en « non renseignée », jamais dans une famille par défaut", () => {
    expect(activityFamilyOf("")).toBe("unknown");
    expect(activityFamilyOf(" . ")).toBe("unknown");
  });

  it("nomme chaque famille, dans l'ordre de l'écran", () => {
    expect(ACTIVITY_FAMILIES.map((family) => family.key)).toEqual([
      "hospitality",
      "restaurant",
      "cafe_bar",
      "food_retail",
      "other",
      "unknown",
    ]);
  });
});
