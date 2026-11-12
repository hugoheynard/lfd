import {
  allergenReferenceKey,
  listContent,
  PIM_CONTENT_KEYS,
  pimContentKey,
  productDetailKey,
  recordContent,
} from "../pim-content-keys.js";

/** La règle de l'objet (`container/versioned-contents-store.ts`, `CONTENT_KEY`). */
const OBJECT_KEY = /^[a-z0-9:-]{1,64}$/u;

describe("les clés des contenus du référentiel", () => {
  it("chaque clé fixe est admise par l'objet, et aucune ne se répète", () => {
    const keys = Object.values(PIM_CONTENT_KEYS);

    expect(keys.every((key) => OBJECT_KEY.test(key))).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("le détail d'une fiche a sa clé, admise pour un identifiant UUID", () => {
    const key = productDetailKey("0b6f1c9e-8a3d-4f7e-9a51-2c4d6e8f0a1b");

    expect(key).toBe("pim-product:0b6f1c9e-8a3d-4f7e-9a51-2c4d6e8f0a1b");
    expect(key === null ? false : OBJECT_KEY.test(key)).toBe(true);
  });

  it("une clé que l'objet refuserait vaut `null` : la base, sans rangement", () => {
    expect(productDetailKey("prd_1")).toBeNull();
    expect(productDetailKey("PRD-1")).toBeNull();
    expect(productDetailKey("x".repeat(60))).toBeNull();
    expect(productDetailKey("a:b")).toBeNull();
    expect(pimContentKey("pim allergens")).toBeNull();
  });

  it("le référentiel des allergènes a une clé par portée et par langue", () => {
    expect(allergenReferenceKey("eu", "fr")).toBe("pim-allergens-eu-fr");
    expect(allergenReferenceKey("world", "fr")).toBe("pim-allergens-world-fr");
  });
});

describe("les contrôles de forme", () => {
  it("une liste n'accepte qu'un tableau", () => {
    const accepts = listContent<string>();

    expect(accepts([])).toBe(true);
    expect(accepts({})).toBe(false);
    expect(accepts(null)).toBe(false);
  });

  it("un objet n'est accepté qu'avec ses champs", () => {
    const accepts = recordContent<{ id: string; variants: unknown[] }>("id", "variants");

    expect(accepts({ id: "p", variants: [] })).toBe(true);
    expect(accepts({ id: "p" })).toBe(false);
    expect(accepts([])).toBe(false);
    expect(accepts(null)).toBe(false);
  });
});
