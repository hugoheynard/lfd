import { diffItem, headerDiff, planDiff, type RevisionIndex } from "../diff.js";
import type { JsonObject } from "../fingerprint.js";

/**
 * **Le diff se planifie avant de lire.** C'est ce que ces cas tiennent : le plan
 * se calcule sur des empreintes seules, donc sans charger un payload. Sur mille
 * articles dont trois ont bougé, on en lira trois — c'est toute la raison d'être
 * du magasin adressé par contenu.
 */
function index(entries: Record<string, string>, proRatioBp: number | null = 9_000): RevisionIndex {
  return { hashBySku: new Map(Object.entries(entries)), proRatioBp };
}

describe("planDiff", () => {
  it("range chaque SKU dans un seul des trois seaux", () => {
    const plan = planDiff(
      index({ garde: "h1", change: "h2", part: "h3" }),
      index({ garde: "h1", change: "h2-bis", arrive: "h4" }),
    );

    expect(plan).toEqual({ added: ["arrive"], removed: ["part"], changed: ["change"] });
  });

  /** Un article inchangé n'est dans aucun seau : il ne sera jamais lu. */
  it("ne retient RIEN entre deux révisions identiques", () => {
    const same = { a: "h1", b: "h2" };

    expect(planDiff(index(same), index(same))).toEqual({ added: [], removed: [], changed: [] });
  });

  /** Un plan stable : un écran qui pagine ne doit pas voir ses lignes danser. */
  it("trie les trois listes", () => {
    const plan = planDiff(index({ z: "1", y: "1" }), index({ b: "1", a: "1" }));

    expect(plan.added).toEqual(["a", "b"]);
    expect(plan.removed).toEqual(["y", "z"]);
  });
});

describe("headerDiff", () => {
  /**
   * Le cas qui a décidé de l'en-tête : le rapport bouge, aucun article ne
   * change, et toutes les factures professionnelles changent.
   */
  it("montre le rapport qui bouge, articles identiques", () => {
    const same = { a: "h1" };

    expect(headerDiff(index(same, 9_000), index(same, 8_800))).toEqual([
      { field: "proRatioBp", before: "9000", after: "8800" },
    ]);
  });

  /** `null` est une valeur — « jamais réglé » — et le diff doit la nommer. */
  it("nomme le passage de « jamais réglé » à un rapport", () => {
    expect(headerDiff(index({}, null), index({}, 9_000))[0]).toEqual({
      field: "proRatioBp",
      before: "—",
      after: "9000",
    });
  });

  it("ne dit rien quand le rapport n'a pas bougé", () => {
    expect(headerDiff(index({}, 9_000), index({}, 9_000))).toEqual([]);
  });
});

describe("diffItem", () => {
  const before: JsonObject = {
    name: { fr: "Croissant" },
    priceCents: 120,
    allergens: ["AW"],
  };

  it("rend les chaînes telles quelles, sans guillemets autour", () => {
    const diff = diffItem("VIE-1", { name: "Croissant" }, { name: "Pain au chocolat" });

    expect(diff.fields).toEqual([
      { field: "name", before: "Croissant", after: "Pain au chocolat" },
    ]);
  });

  it("ne signale que les champs qui ont bougé", () => {
    const diff = diffItem("VIE-1", before, { ...before, priceCents: 130 });

    expect(diff.fields.map((f) => f.field)).toEqual(["priceCents"]);
  });

  /**
   * Un champ imbriqué rend une ligne pour le champ ENTIER. Descendre plus bas
   * demanderait de décider ce qu'est « la même » entrée dans deux tableaux — un
   * visuel déplacé est-il modifié ou remplacé ? La question n'a pas de réponse
   * universelle ; montrer les deux états est honnête.
   */
  it("remonte un champ imbriqué au premier niveau, avec ses deux états", () => {
    const diff = diffItem("VIE-1", before, {
      ...before,
      name: { fr: "Croissant", en: "Croissant" },
    });

    expect(diff.fields[0]).toEqual({
      field: "name",
      before: '{"fr":"Croissant"}',
      after: '{"en":"Croissant","fr":"Croissant"}',
    });
  });

  /** Trois états distincts sur les allergènes, et les confondre est la faute. */
  it("distingue « pas de fiche » de « fiche sans allergène »", () => {
    const diff = diffItem("VIE-1", { allergens: null }, { allergens: [] });

    expect(diff.fields).toEqual([{ field: "allergens", before: "null", after: "[]" }]);
  });

  it("nomme un champ apparu, et un champ disparu", () => {
    const appeared = diffItem("VIE-1", {}, { weightGrams: 80 });
    const gone = diffItem("VIE-1", { weightGrams: 80 }, {});

    expect(appeared.fields).toEqual([{ field: "weightGrams", before: "—", after: "80" }]);
    expect(gone.fields).toEqual([{ field: "weightGrams", before: "80", after: "—" }]);
  });
});
