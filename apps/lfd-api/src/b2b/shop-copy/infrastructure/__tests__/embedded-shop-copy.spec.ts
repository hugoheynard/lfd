import { embeddedShopCopyManifest, embeddedShopCopyRenames } from "../embedded-shop-copy.js";

describe("le manifeste embarqué", () => {
  const manifest = embeddedShopCopyManifest();

  it("porte les clés du dictionnaire général, avec leurs trois langues", () => {
    const entry = manifest.entry("cart.whoTitle");
    expect(entry?.space).toBe("cart");
    expect(Object.keys(entry?.originals ?? {})).toEqual(["fr", "en", "it"]);
  });

  it("porte les variables d'un texte qui en a", () => {
    expect(manifest.entry("accueilPublic.hello.title")?.variables).toEqual(["name"]);
  });

  it("ne connaît pas une clé inventée", () => {
    expect(manifest.knows("pas.une.cle")).toBe(false);
  });

  it("n'a pas de clé en double", () => {
    const keys = manifest.entries().map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("lit les renommages comme des paires", () => {
    expect(Array.isArray(embeddedShopCopyRenames())).toBe(true);
  });
});
