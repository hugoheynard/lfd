import {
  imageReplacement,
  MediaReplacedBySelfError,
  MediaReplacementUrlRequiredError,
} from "../image-replacement.js";

const A = "https://media.example/products/a.jpg";
const B = "https://media.example/products/b.jpg";

describe("imageReplacement", () => {
  it("borde les deux URL", () => {
    expect(imageReplacement(` ${A} `, `${B}\n`)).toEqual({ from: A, to: B });
  });

  it("refuse une URL vide, d'un côté comme de l'autre", () => {
    expect(() => imageReplacement("  ", B)).toThrow(MediaReplacementUrlRequiredError);
    expect(() => imageReplacement(A, "")).toThrow(MediaReplacementUrlRequiredError);
  });

  it("refuse de remplacer une image par elle-même, espaces compris", () => {
    expect(() => imageReplacement(A, ` ${A}`)).toThrow(MediaReplacedBySelfError);
  });
});
