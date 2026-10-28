import {
  FixedSellableArticles,
  InMemoryBatchShortcuts,
  shortcutRow,
} from "../../__tests__/batch-shortcut-doubles.js";
import { GetBatchShortcutsSettingsHandler } from "../get-batch-shortcuts-settings.handler.js";
import { GetWorkshopShortcutsHandler } from "../get-workshop-shortcuts.handler.js";

/** Les deux lectures des raccourcis du fournil (plan des raccourcis, S1-S2). */

const ARTICLES = [
  { sku: "VIE-001", name: "Croissant", familyId: "fam-vien", familyName: "Viennoiseries" },
  { sku: "PAI-001", name: "Baguette", familyId: "fam-pain", familyName: "Pains" },
];

function table(): InMemoryBatchShortcuts {
  return new InMemoryBatchShortcuts().seed(
    shortcutRow({ id: "a", label: "1 chariot", pieces: 96, position: 1 }),
    shortcutRow({ id: "b", label: "1 plaque", pieces: 24, position: 0 }),
    shortcutRow({ id: "c", sku: "PAI-001", label: "1 panier", pieces: 10 }),
    shortcutRow({ id: "d", label: "retiré", removedAt: new Date(Date.UTC(2000, 0, 2)) }),
  );
}

describe("GetBatchShortcutsSettingsHandler", () => {
  it("rend les articles dans l'ordre reçu et les raccourcis vivants par SKU puis position", async () => {
    const view = await new GetBatchShortcutsSettingsHandler(
      table().reader(),
      new FixedSellableArticles(ARTICLES),
    ).execute();

    expect(view.articles).toEqual(ARTICLES);
    expect(view.shortcuts.map((shortcut) => shortcut.id)).toEqual(["c", "b", "a"]);
    expect(view.shortcuts[1]).toEqual({
      id: "b",
      sku: "VIE-001",
      label: "1 plaque",
      pieces: 24,
      position: 0,
    });
  });
});

describe("GetWorkshopShortcutsHandler", () => {
  it("range les raccourcis vivants par SKU, dans l'ordre de leur position", async () => {
    const view = await new GetWorkshopShortcutsHandler(table().reader()).execute();

    expect(view.bySku).toEqual({
      "PAI-001": [{ id: "c", label: "1 panier", pieces: 10 }],
      "VIE-001": [
        { id: "b", label: "1 plaque", pieces: 24 },
        { id: "a", label: "1 chariot", pieces: 96 },
      ],
    });
  });

  it("sans raccourci : aucune entrée", async () => {
    const view = await new GetWorkshopShortcutsHandler(
      new InMemoryBatchShortcuts().reader(),
    ).execute();

    expect(view.bySku).toEqual({});
  });
});
