import { isDescriptiveAltText, isMediaAltWritten } from "../index.js";

const URL = "https://media.example/products/abc.png";

describe("l'alternative d'une image", () => {
  it("est rédigée quand la source décrit l'image", () => {
    expect(isMediaAltWritten({ fr: "Un croissant" }, URL)).toBe(true);
  });

  it("n'est pas rédigée quand elle manque, est vide, ou n'est que l'URL", () => {
    expect(isMediaAltWritten(undefined, URL)).toBe(false);
    expect(isMediaAltWritten({}, URL)).toBe(false);
    expect(isMediaAltWritten({ fr: "   " }, URL)).toBe(false);
    expect(isMediaAltWritten({ fr: URL }, URL)).toBe(false);
    expect(isMediaAltWritten({ en: "A croissant" }, URL)).toBe(false);
  });

  /** Régression : 58 images sur 89 de la boutique portaient une URL en alternative (RGAA, 2026-10-26). */
  it("n'est pas rédigée quand la source est une autre URL, un chemin ou un nom de fichier", () => {
    expect(isMediaAltWritten({ fr: "https://media.lafoliecoffee.info/images/x.webp" }, URL)).toBe(
      false,
    );
    expect(isMediaAltWritten({ fr: "products/abc" }, URL)).toBe(false);
    expect(isMediaAltWritten({ fr: "IMG_0042.HEIC" }, URL)).toBe(false);
  });

  it("garde une phrase qui contient une barre oblique", () => {
    expect(isDescriptiveAltText("Pain 1/2 complet")).toBe(true);
    expect(isDescriptiveAltText("//cdn.example/x")).toBe(false);
  });
});
