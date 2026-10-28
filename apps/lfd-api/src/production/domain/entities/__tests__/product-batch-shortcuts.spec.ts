import { BatchShortcut, type BatchShortcutState } from "../batch-shortcut.js";
import { ProductBatchShortcuts } from "../product-batch-shortcuts.js";
import {
  BatchShortcutNotFoundError,
  DuplicateBatchShortcutLabelError,
  InvalidBatchShortcutLabelError,
  InvalidBatchShortcutPiecesError,
  TooManyBatchShortcutsError,
} from "../../errors/batch-shortcut-errors.js";

/** Les raccourcis d'un produit (plan des raccourcis du fournil, §2). */

const AT = new Date(Date.UTC(2000, 0, 2));
const AUTHOR = { staffUserId: "staff-1", name: "Marie Dupont" };

function row(id: string, label: string, position: number): BatchShortcutState {
  return {
    id,
    sku: "VIE-001",
    label,
    pieces: 24,
    position,
    createdBy: AUTHOR,
    createdAt: AT,
    updatedAt: AT,
    removedAt: null,
  };
}

function product(...rows: readonly BatchShortcutState[]): ProductBatchShortcuts {
  return ProductBatchShortcuts.restore(
    "VIE-001",
    rows.map((state) => BatchShortcut.restore(state)),
  );
}

function add(target: ProductBatchShortcuts, id: string, label: string, pieces = 24): BatchShortcut {
  return target.add({ id, terms: { label, pieces }, author: AUTHOR, at: AT });
}

describe("ProductBatchShortcuts — ajouter", () => {
  it("rogne le nom, place le raccourci après le dernier et le retient à écrire", () => {
    const shortcuts = product(row("a", "1 plaque", 0), row("b", "1 chariot", 3));

    const added = add(shortcuts, "c", "  2 plaques  ", 48);

    expect(added.label).toBe("2 plaques");
    expect(added.position).toBe(4);
    expect(shortcuts.shortcuts.map((shortcut) => shortcut.id)).toEqual(["a", "b", "c"]);
    expect(shortcuts.changed.map((shortcut) => shortcut.id)).toEqual(["c"]);
  });

  it("admet six raccourcis et refuse le septième, en nommant le produit", () => {
    const shortcuts = product();
    for (const index of [1, 2, 3, 4, 5, 6]) {
      add(shortcuts, `s${index}`, `${index} plaques`);
    }

    expect(() => add(shortcuts, "s7", "7 plaques")).toThrow(TooManyBatchShortcutsError);
    expect(() => add(shortcuts, "s7", "7 plaques")).toThrow(/VIE-001 a déjà 6 raccourcis/u);
  });

  it("refuse le même nom, casse et espaces ignorés", () => {
    const shortcuts = product(row("a", "1 plaque", 0));

    expect(() => add(shortcuts, "b", " 1 PLAQUE ")).toThrow(DuplicateBatchShortcutLabelError);
    expect(shortcuts.changed).toEqual([]);
  });

  it.each(["", "   ", "x".repeat(31)])("refuse le nom « %s »", (label) => {
    expect(() => add(product(), "a", label)).toThrow(InvalidBatchShortcutLabelError);
  });

  it("admet trente caractères, comptés en caractères et non en unités UTF-16", () => {
    expect(add(product(), "a", "é".repeat(30)).label).toHaveLength(30);
    expect(add(product(), "b", "🥐".repeat(30)).label).toBe("🥐".repeat(30));
  });

  it.each([0, -3, 2.5, Number.NaN, 3_000_000_000])("refuse %s pièces", (pieces) => {
    expect(() => add(product(), "a", "1 plaque", pieces)).toThrow(InvalidBatchShortcutPiecesError);
  });
});

describe("ProductBatchShortcuts — modifier", () => {
  it("change le nom et les pièces, et rend ce qu'ils étaient", () => {
    const shortcuts = product(row("a", "1 plaque", 0));

    const change = shortcuts.update("a", { label: "1 grande plaque", pieces: 30 }, AT);

    expect(change?.previous).toEqual({ label: "1 plaque", pieces: 24 });
    expect(change?.shortcut.terms()).toEqual({ label: "1 grande plaque", pieces: 30 });
    expect(shortcuts.changed.map((shortcut) => shortcut.id)).toEqual(["a"]);
  });

  it("ne retient rien quand rien ne change", () => {
    const shortcuts = product(row("a", "1 plaque", 0));

    expect(shortcuts.update("a", { label: " 1 plaque ", pieces: 24 }, AT)).toBeNull();
    expect(shortcuts.changed).toEqual([]);
  });

  it("admet de changer la casse de son propre nom, mais pas de prendre celui d'un autre", () => {
    const shortcuts = product(row("a", "1 plaque", 0), row("b", "1 chariot", 1));

    expect(shortcuts.update("a", { label: "1 Plaque", pieces: 24 }, AT)).not.toBeNull();
    expect(() => shortcuts.update("a", { label: "1 CHARIOT", pieces: 24 }, AT)).toThrow(
      DuplicateBatchShortcutLabelError,
    );
  });

  it("refuse un raccourci qui n'est pas au produit", () => {
    expect(() => product().update("x", { label: "1 plaque", pieces: 1 }, AT)).toThrow(
      BatchShortcutNotFoundError,
    );
  });
});

describe("ProductBatchShortcuts — supprimer", () => {
  it("archive le raccourci, libère son nom et une place sous le plafond", () => {
    const shortcuts = product(row("a", "1 plaque", 0));

    const removed = shortcuts.remove("a", AT);

    expect(removed.removed).toBe(true);
    expect(removed.snapshot().removedAt).toEqual(AT);
    expect(shortcuts.shortcuts).toEqual([]);
    expect(add(shortcuts, "b", "1 plaque").label).toBe("1 plaque");
    expect(shortcuts.changed.map((shortcut) => shortcut.id)).toEqual(["a", "b"]);
  });

  it("refuse un raccourci déjà supprimé", () => {
    const shortcuts = product(row("a", "1 plaque", 0));
    shortcuts.remove("a", AT);

    expect(() => shortcuts.remove("a", AT)).toThrow(BatchShortcutNotFoundError);
  });
});
