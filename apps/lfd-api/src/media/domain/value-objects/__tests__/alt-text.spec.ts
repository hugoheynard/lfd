import { imageAlt, NO_ALT, NonDescriptiveAltError, storedAlt } from "../alt-text.js";

const URL = "https://media.example/products/abc.png";

/**
 * Régression : une alternative absente se repliait sur l'URL du fichier, et le
 * lecteur d'écran de la boutique la lisait (58 images sur 89, RGAA, 2026-10-26).
 */
describe("l'alternative d'une image — à l'écriture", () => {
  it("range l'absence en source vide, jamais l'URL", () => {
    expect(imageAlt(null, URL)).toEqual({ fr: "" });
    expect(imageAlt({ fr: "  " }, URL)).toBe(NO_ALT);
  });

  /** Régression évitée : une source vide ou héritée ne doit pas emporter une traduction rédigée. */
  it("garde les traductions qui décrivent l'image quand la source manque", () => {
    expect(imageAlt({ en: "A croissant" }, URL)).toEqual({ fr: "", en: "A croissant" });
    expect(imageAlt({ fr: URL, it: " Un cornetto " }, URL)).toEqual({ fr: "", it: "Un cornetto" });
    expect(imageAlt({ fr: "", en: "IMG_1.jpg" }, URL)).toBe(NO_ALT);
  });

  it("lit l'URL de l'image elle-même comme une absence (ancien repli renvoyé)", () => {
    expect(imageAlt({ fr: URL }, URL)).toBe(NO_ALT);
  });

  it("garde une alternative rédigée, rognée, traductions comprises", () => {
    expect(imageAlt({ fr: " Un croissant ", en: "A croissant" }, URL)).toEqual({
      fr: "Un croissant",
      en: "A croissant",
    });
  });

  it.each(["https://media.lafoliecoffee.info/images/x.webp", "products/abc", "IMG_0042.jpg"])(
    "refuse « %s » : une adresse ou un fichier ne décrit pas l'image",
    (text) => {
      expect(() => imageAlt({ fr: text }, URL)).toThrow(NonDescriptiveAltError);
    },
  );
});

describe("l'alternative d'une image — à la lecture", () => {
  it("rend l'absence pour une colonne illisible ou héritée du repli sur l'URL", () => {
    expect(storedAlt(null, URL)).toBe(NO_ALT);
    expect(storedAlt({ fr: URL }, URL)).toBe(NO_ALT);
    expect(storedAlt({ fr: "IMG_0042.jpg" }, URL)).toBe(NO_ALT);
  });

  it("ne masque pas une traduction valide derrière une source héritée de l'URL", () => {
    expect(storedAlt({ fr: URL, en: "A butter croissant" }, URL)).toEqual({
      fr: "",
      en: "A butter croissant",
    });
  });

  it("rend telle quelle une alternative qui décrit l'image", () => {
    const alt = { fr: "Un croissant", it: "Un cornetto" };
    expect(storedAlt(alt, URL)).toBe(alt);
  });
});
