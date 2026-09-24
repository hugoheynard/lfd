import { StorefrontContent } from "../storefront-content.js";

const INFO = {
  kind: "info",
  badge: null,
  title: { fr: "Pâques" },
  lede: null,
  image: null,
  linkShelfKey: null,
} as const;

describe("StorefrontContent", () => {
  it("un produit ne garde que son SKU, sans espaces autour", () => {
    expect(StorefrontContent.of({ kind: "product", sku: " CRO-01 " }).state).toEqual({
      kind: "product",
      sku: "CRO-01",
    });
  });

  it("refuse un produit sans article", () => {
    expect(() => StorefrontContent.of({ kind: "product", sku: "  " })).toThrow(/choisissez-en un/u);
  });

  it("refuse une info sans titre français", () => {
    expect(() => StorefrontContent.of({ ...INFO, title: { fr: "" } })).toThrow(
      /Le titre d'une info porte un texte en français/u,
    );
  });

  it("refuse une image sans adresse", () => {
    expect(() => StorefrontContent.of({ ...INFO, image: { url: " ", alt: null } })).toThrow(
      /vient de la médiathèque/u,
    );
  });

  it("refuse un lien vers un rayon mal formé", () => {
    expect(() => StorefrontContent.of({ ...INFO, linkShelfKey: " choco" })).toThrow(
      /n'est pas un rayon/u,
    );
  });
});
