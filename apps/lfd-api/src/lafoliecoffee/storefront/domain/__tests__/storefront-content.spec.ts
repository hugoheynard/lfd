import { ShelfKey } from "../shelf-key.js";
import { infoActionOf, StorefrontContent } from "../storefront-content.js";

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

  describe("une annonce liée à une opération (D11)", () => {
    const LINKED = { ...INFO, operationKey: "noel-2026" };

    it("hérite son titre quand il est vide — et le rend absent, pas vide", () => {
      const state = StorefrontContent.of({ ...LINKED, title: { fr: " " } }).state;

      expect(state).toEqual({ ...INFO, title: null, operationKey: "noel-2026" });
    });

    it("garde un titre rempli : il surcharge celui de l'opération", () => {
      expect(StorefrontContent.of(LINKED).state).toMatchObject({ title: { fr: "Pâques" } });
    });

    it("refuse une traduction sans français : l'héritage est tout ou rien", () => {
      expect(() => StorefrontContent.of({ ...LINKED, title: { fr: "", en: "Easter" } })).toThrow(
        /porte un texte en français/u,
      );
    });

    it("refuse une clé d'opération mal formée, en nommant le geste", () => {
      expect(() => StorefrontContent.of({ ...LINKED, operationKey: "Noël 2026" })).toThrow(
        /n'est pas une opération : choisissez-en une/u,
      );
    });

    it("accepte une clé que rien ne connaît encore : seule la forme se refuse", () => {
      expect(StorefrontContent.of({ ...LINKED, operationKey: "paques-2031" }).state).toMatchObject({
        operationKey: "paques-2031",
      });
    });

    it("refuse un rayon ET une opération à la fois", () => {
      expect(() => StorefrontContent.of({ ...LINKED, linkShelfKey: "bread" })).toThrow(
        /un rayon OU une opération, pas les deux/u,
      );
    });

    it("refuse une action qui contredit sa cible", () => {
      expect(() => StorefrontContent.of({ ...INFO, action: "operation" })).toThrow(
        /doit la désigner/u,
      );
      expect(() => StorefrontContent.of({ ...LINKED, action: "none" })).toThrow(
        /ne porte pas de cible/u,
      );
    });

    it("accepte une action qui dit la même chose que sa cible", () => {
      expect(StorefrontContent.of({ ...LINKED, action: "operation" }).state).toMatchObject({
        operationKey: "noel-2026",
      });
    });
  });

  it("une info sans opération garde l'obligation du titre, même clé absente", () => {
    expect(() => StorefrontContent.of({ ...INFO, operationKey: null, title: { fr: "" } })).toThrow(
      /Le titre d'une info porte un texte en français/u,
    );
  });

  it("déduit l'action de la cible", () => {
    expect(infoActionOf({ linkShelfKey: null })).toBe("none");
    expect(infoActionOf({ linkShelfKey: "bread", operationKey: null })).toBe("shelf");
    expect(infoActionOf({ linkShelfKey: null, operationKey: "noel-2026" })).toBe("operation");
  });
});

describe("ShelfKey", () => {
  it("accepte le rayon d'une opération, `op:<key>`", () => {
    expect(ShelfKey.of("op:noel-2026").value).toBe("op:noel-2026");
  });

  it("accepte une clé d'opération de 64 caractères, préfixe en sus", () => {
    const key = `op:${"a".repeat(64)}`;
    expect(ShelfKey.of(key).value).toBe(key);
  });

  it("refuse un rayon d'opération mal formé", () => {
    expect(() => ShelfKey.of("op:Noël")).toThrow(/n'est pas un rayon/u);
    expect(() => ShelfKey.of("op:")).toThrow(/n'est pas un rayon/u);
  });
});
