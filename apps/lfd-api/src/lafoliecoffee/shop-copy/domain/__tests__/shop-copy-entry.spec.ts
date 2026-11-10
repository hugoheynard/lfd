import { ShopCopyEntry } from "../shop-copy-entry.js";
import {
  InvalidShopCopyTextError,
  ShopCopyChangedError,
  UnknownShopCopyKeyError,
} from "../shop-copy-errors.js";
import { ShopCopyManifest } from "../shop-copy-manifest.js";
import { AT, CART_TITLE, LATER, MANIFEST, stamp } from "./shop-copy-fixtures.js";

function drafted(text: string): ShopCopyEntry {
  const entry = ShopCopyEntry.untouched(CART_TITLE.key, "fr");
  entry.draft(text, MANIFEST, 0, stamp());
  return entry;
}

describe("un texte de la boutique — le brouillon", () => {
  it("part du texte du code : révision 0, rien à publier", () => {
    const entry = ShopCopyEntry.untouched(CART_TITLE.key, "fr");
    expect(entry.revision).toBe(0);
    expect(entry.pending).toBe(false);
  });

  it("écrit un remplacement en `set`, monte la révision, fige qui et quand", () => {
    const entry = drafted("Mon panier");
    expect(entry.snapshot()).toMatchObject({
      revision: 1,
      draft: { state: "set", text: "Mon panier" },
      drafted: { at: AT, staffId: "fiche-colette" },
      publishedText: null,
    });
    expect(entry.pending).toBe(true);
  });

  it("refuse une révision dépassée — deux rédacteurs sur le même texte", () => {
    const entry = drafted("Mon panier");
    expect(() => entry.draft("Votre panier", MANIFEST, 0, stamp())).toThrow(ShopCopyChangedError);
    expect(entry.snapshot().draft).toEqual({ state: "set", text: "Mon panier" });
  });

  it("refuse une clé que le manifeste ne connaît pas", () => {
    const entry = ShopCopyEntry.untouched("retire.du.code", "fr");
    expect(() => entry.draft("x", MANIFEST, 0, stamp())).toThrow(UnknownShopCopyKeyError);
  });

  it("refuse un remplacement qu'un garde-fou refuse, sans rien changer", () => {
    const entry = ShopCopyEntry.untouched(CART_TITLE.key, "fr");
    expect(() => entry.draft(" ", MANIFEST, 0, stamp())).toThrow(InvalidShopCopyTextError);
    expect(entry.revision).toBe(0);
  });

  it("revenir à l'original sans rien de publié abandonne le brouillon", () => {
    const entry = drafted("Mon panier");
    entry.reset(1, stamp(LATER));
    expect(entry.snapshot()).toMatchObject({
      revision: 2,
      draft: { state: "unchanged" },
      drafted: { at: LATER },
    });
    expect(entry.pending).toBe(false);
  });

  it("revenir à l'original d'un texte publié attend « Publier » : `reset`", () => {
    const entry = drafted("Mon panier");
    entry.publish(MANIFEST, stamp());
    entry.reset(1, stamp(LATER));
    expect(entry.snapshot().draft).toEqual({ state: "reset" });
    expect(entry.snapshot().publishedText).toBe("Mon panier");
  });
});

describe("un texte de la boutique — la publication", () => {
  it("`set` → publié, avec la valeur d'avant et d'après", () => {
    const entry = drafted("Mon panier");
    expect(entry.publish(MANIFEST, stamp(LATER))).toEqual({
      key: CART_TITLE.key,
      locale: "fr",
      before: null,
      after: "Mon panier",
    });
    expect(entry.snapshot()).toMatchObject({
      draft: { state: "unchanged" },
      publishedText: "Mon panier",
      published: { at: LATER },
      // La publication n'est pas un geste de rédacteur : la révision ne bouge pas,
      // et le dernier brouillon reste daté (A2).
      revision: 1,
      drafted: { at: AT },
    });
  });

  it("`reset` → publié nul", () => {
    const entry = drafted("Mon panier");
    entry.publish(MANIFEST, stamp());
    entry.reset(1, stamp());
    expect(entry.publish(MANIFEST, stamp())).toEqual({
      key: CART_TITLE.key,
      locale: "fr",
      before: "Mon panier",
      after: null,
    });
    expect(entry.snapshot().publishedText).toBeNull();
  });

  it("un brouillon égal au publié se solde sans changement servi", () => {
    const entry = drafted("Mon panier");
    entry.publish(MANIFEST, stamp());
    entry.draft("Mon panier", MANIFEST, 2 - 1, stamp());
    expect(entry.publish(MANIFEST, stamp())).toBeNull();
    expect(entry.pending).toBe(false);
  });

  it("une orpheline en `set` n'est jamais publiée — son brouillon reste", () => {
    const entry = drafted("Mon panier");
    const without = ShopCopyManifest.of([]);
    expect(entry.publish(without, stamp())).toBeNull();
    expect(entry.snapshot().draft).toEqual({ state: "set", text: "Mon panier" });
  });

  it("une orpheline remise à l'original se publie : c'est ainsi qu'on l'efface", () => {
    const entry = drafted("Mon panier");
    entry.publish(MANIFEST, stamp());
    entry.reset(1, stamp());
    expect(entry.publish(ShopCopyManifest.of([]), stamp())?.after).toBeNull();
  });
});
