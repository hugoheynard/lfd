import { isMediaAltWritten, mediaAltOrUrl } from "../index.js";

const URL = "https://media.example/products/abc.png";

describe("l'alternative d'une image", () => {
  it("est rédigée quand la source est écrite et n'est pas l'URL", () => {
    expect(isMediaAltWritten({ fr: "Un croissant" }, URL)).toBe(true);
  });

  it("n'est pas rédigée quand elle manque, est vide, ou n'est que le repli sur l'URL", () => {
    expect(isMediaAltWritten(undefined, URL)).toBe(false);
    expect(isMediaAltWritten({}, URL)).toBe(false);
    expect(isMediaAltWritten({ fr: "   " }, URL)).toBe(false);
    expect(isMediaAltWritten({ fr: URL }, URL)).toBe(false);
    expect(isMediaAltWritten({ en: "A croissant" }, URL)).toBe(false);
  });

  it("garde l'alternative rédigée, traductions comprises", () => {
    const alt = { fr: "Un croissant", en: "A croissant" };
    expect(mediaAltOrUrl(alt, URL)).toBe(alt);
  });

  it("se replie sur l'URL faute de source, et laisse tomber les traductions orphelines", () => {
    expect(mediaAltOrUrl({ en: "A croissant" }, URL)).toEqual({ fr: URL });
    expect(mediaAltOrUrl(null, URL)).toEqual({ fr: URL });
  });
});
