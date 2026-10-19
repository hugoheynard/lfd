import { BUNDLE_KEY_MAX_LENGTH, keyFrom } from "../bundle-key.js";

describe("keyFrom", () => {
  it("tire une clé d'URL d'un libellé : minuscules, sans accent, tirets", () => {
    expect(keyFrom("Petit déjeuner")).toBe("petit-dejeuner");
    expect(keyFrom("  Café & croissant !  ")).toBe("cafe-croissant");
    expect(keyFrom("Œufs — 2 pièces")).toBe("oeufs-2-pieces");
  });

  it("rend la chaîne vide quand rien ne se lit en lettres latines ni en chiffres", () => {
    expect(keyFrom("☕ —")).toBe("");
  });

  it("borne la clé sans la terminer par un tiret", () => {
    const key = keyFrom(`${"a".repeat(BUNDLE_KEY_MAX_LENGTH - 1)} b`);

    expect(key.length).toBeLessThanOrEqual(BUNDLE_KEY_MAX_LENGTH);
    expect(key.endsWith("-")).toBe(false);
  });
});
