import {
  CART_TITLE,
  GREETING,
  MANIFEST,
  stamp,
} from "../../domain/__tests__/shop-copy-fixtures.js";
import type { ShopCopyEntryState } from "../../domain/shop-copy-entry.js";
import { shopCopyAdminView } from "../shop-copy-admin-view.js";

const NONE = { version: 0, publishedAt: null, publishedBy: null };

function state(
  partial: Partial<ShopCopyEntryState> & Pick<ShopCopyEntryState, "key" | "locale">,
): ShopCopyEntryState {
  return {
    revision: 1,
    draft: { state: "unchanged" },
    drafted: null,
    publishedText: null,
    published: null,
    ...partial,
  };
}

describe("l'écran des textes", () => {
  it("rend chaque clé du manifeste, dans son ordre, avec le texte du code", () => {
    const view = shopCopyAdminView(MANIFEST, [], NONE);
    expect(view.entries.map((entry) => entry.key)).toEqual([GREETING.key, CART_TITLE.key]);
    expect(view.entries[1]?.locales.it).toEqual({
      original: "Carrello",
      draftState: "unchanged",
      draftText: null,
      publishedText: null,
      revision: 0,
      draftAt: null,
      draftBy: null,
    });
    expect(view.pendingCount).toBe(0);
  });

  it("montre les orphelines à part, sans texte du code", () => {
    const view = shopCopyAdminView(
      MANIFEST,
      [state({ key: "retire.du.code", locale: "fr", publishedText: "x" })],
      NONE,
    );
    expect(view.orphans).toHaveLength(1);
    expect(view.orphans[0]).toMatchObject({ key: "retire.du.code", space: null });
    expect(view.orphans[0]?.locales.fr).toMatchObject({ original: null, publishedText: "x" });
  });

  it("compte ce qui attend « Publier », et signale le français changé depuis une traduction", () => {
    const view = shopCopyAdminView(
      MANIFEST,
      [
        state({
          key: CART_TITLE.key,
          locale: "fr",
          draft: { state: "set", text: "Mon panier" },
          drafted: stamp(new Date(60_000)),
        }),
        state({ key: CART_TITLE.key, locale: "en", drafted: stamp(new Date(0)) }),
      ],
      { version: 3, publishedAt: new Date(0), publishedBy: "fiche-colette" },
    );
    expect(view.pendingCount).toBe(1);
    expect(view.version).toBe(3);
    expect(view.entries[1]?.staleTranslations).toEqual(["en", "it"]);
    expect(view.entries[1]?.locales.fr.draftText).toBe("Mon panier");
  });
});
