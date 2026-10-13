import { contentAddressOf, NotContentAddressedError } from "../content-address.js";

const HASH = "0123456789abcdef".repeat(4);

describe("contentAddressOf", () => {
  it("garde l'empreinte et l'extension, quel que soit le préfixe", () => {
    expect(contentAddressOf(`products/${HASH}.png`)).toBe(`${HASH}.png`);
    expect(contentAddressOf(`images/${HASH}.png`)).toBe(`${HASH}.png`);
  });

  it("refuse une clé dont le nom n'est pas une empreinte", () => {
    expect(() => contentAddressOf("products/deadbeef.png")).toThrow(NotContentAddressedError);
    expect(() => contentAddressOf(`products/${HASH.toUpperCase()}.png`)).toThrow(
      NotContentAddressedError,
    );
    expect(() => contentAddressOf(`products/${HASH}`)).toThrow(NotContentAddressedError);
  });
});
