import { servedImageAlt } from "../catalog-image-alt.js";

describe("servedImageAlt — l'alternative servie depuis une copie du catalogue", () => {
  it("sert une alternative rédigée telle quelle", () => {
    expect(servedImageAlt("Croissant doré sur une planche")).toBe("Croissant doré sur une planche");
  });

  it("sert vide une alternative absente", () => {
    expect(servedImageAlt(null)).toBe("");
    expect(servedImageAlt("   ")).toBe("");
  });

  /** Régression : l'ancien repli du contrat recopiait l'URL du fichier dans la copie. */
  it.each([
    "https://media.example.test/products/croissant.webp",
    "//cdn.example.test/a.png",
    "products/abc123",
    "IMG_0042.jpg",
  ])("sert vide une alternative qui n'est qu'une adresse ou un fichier (%s)", (stored) => {
    expect(servedImageAlt(stored)).toBe("");
  });
});
