import { unique } from "../unique-ids.js";

describe("unique", () => {
  it("retire les doublons en gardant l'ordre de première apparition", () => {
    expect(unique(["b", "a", "b", "c", "a"])).toEqual(["b", "a", "c"]);
  });

  it("rend une liste vide pour une liste vide", () => {
    expect(unique([])).toEqual([]);
  });
});
