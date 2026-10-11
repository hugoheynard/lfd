import { ShopCopyEntry } from "../shop-copy-entry.js";
import { NothingToPublishError } from "../shop-copy-errors.js";
import { ShopCopyManifest } from "../shop-copy-manifest.js";
import { ShopCopyRelease } from "../shop-copy-release.js";
import { CART_TITLE, GREETING, MANIFEST, stamp } from "./shop-copy-fixtures.js";

function pending(key: string, text: string): ShopCopyEntry {
  const entry = ShopCopyEntry.untouched(key, "fr");
  entry.draft(text, MANIFEST, 0, stamp());
  return entry;
}

describe("« Publier »", () => {
  it("applique tous les brouillons, monte la version d'un cran, rend les changements", () => {
    const release = ShopCopyRelease.of(3, [
      pending(CART_TITLE.key, "Mon panier"),
      pending(GREETING.key, "Salut {name}"),
    ]);
    const changes = release.publish(MANIFEST, stamp());
    expect(release.expectedVersion).toBe(3);
    expect(release.version).toBe(4);
    expect(changes.map((change) => change.after)).toEqual(["Mon panier", "Salut {name}"]);
    expect(release.entries.every((entry) => !entry.pending)).toBe(true);
  });

  it("refuse une publication sans brouillon", () => {
    const release = ShopCopyRelease.of(1, []);
    expect(() => release.publish(MANIFEST, stamp())).toThrow(NothingToPublishError);
    expect(release.version).toBe(1);
  });

  it("refuse une publication dont les seuls brouillons sont orphelins", () => {
    const release = ShopCopyRelease.of(0, [pending(CART_TITLE.key, "Mon panier")]);
    expect(() => release.publish(ShopCopyManifest.of([]), stamp())).toThrow(NothingToPublishError);
  });
});
