import { canonical, fingerprint } from "../fingerprint.js";
import { buildRevision, type RevisionItemInput } from "../revision.js";

/**
 * **Ce sur quoi tout le reste repose.** Le magasin partagé, le diff et la
 * détection du « rien n'a changé » sont tous des comparaisons d'empreintes : si
 * l'empreinte est instable, aucun d'eux ne fonctionne — et aucun ne le dirait,
 * ils rendraient simplement des différences là où il n'y en a pas.
 */
function item(over: Partial<RevisionItemInput> = {}): RevisionItemInput {
  return {
    sku: "VIE-001-1",
    productId: "prd_1",
    productSku: "VIE-001",
    name: { fr: "Croissant" },
    variantName: { fr: "Croissant" },
    kind: "daily",
    status: "published",
    categoryId: "cat_vien",
    categoryName: { fr: "Viennoiseries" },
    priceCents: 120,
    weightGrams: null,
    isDefault: true,
    isDiscontinued: false,
    allergens: ["AW"],
    vatByContext: { takeaway: 5.5, b2b: 20 },
    soldContexts: ["takeaway", "b2b"],
    editorial: { descriptionShort: { fr: "Pur beurre" } },
    media: [{ role: "gallery", url: "https://cdn.test/a.jpg", alt: { fr: "Un croissant" } }],
    readyAt: null,
    readyBy: null,
    ...over,
  };
}

const HEADER = { proRatioBp: 9_000 };

describe("fingerprint", () => {
  /**
   * L'ordre des clés d'un objet JavaScript suit l'insertion. Sans forme
   * canonique, il suffirait qu'un champ change de place dans un `map` pour que
   * tout le catalogue paraisse modifié — et le magasin partagé se remplirait de
   * doublons qu'aucun diff ne saurait rapprocher.
   */
  it("ignore l'ordre des clés, à tous les étages", () => {
    const a = { z: 1, nested: { b: 2, a: 1 } };
    const b = { nested: { a: 1, b: 2 }, z: 1 };

    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  /** L'ordre d'un tableau porte du sens : celui des visuels, celui des contextes. */
  it("respecte l'ordre des tableaux", () => {
    expect(fingerprint({ m: ["a", "b"] })).not.toBe(fingerprint({ m: ["b", "a"] }));
  });

  /**
   * `JSON.stringify` laisse tomber `undefined`. Sans le retirer AVANT, une clé
   * présente-mais-indéfinie et une clé absente donneraient deux empreintes pour
   * le même contenu — et le magasin garderait deux lignes identiques.
   */
  it("ne distingue pas une clé indéfinie d'une clé absente", () => {
    expect(fingerprint({ a: 1, b: undefined })).toBe(fingerprint({ a: 1 }));
  });

  it("rend une forme lisible, pour qu'un écart se debug à l'œil", () => {
    expect(canonical({ b: 1, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":1}');
  });
});

describe("buildRevision", () => {
  it("trie les articles par SKU — la lecture de la base ne l'est pas", () => {
    const built = buildRevision(HEADER, [item({ sku: "B" }), item({ sku: "A" })]);

    expect(built.items.map((entry) => entry.sku)).toEqual(["A", "B"]);
  });

  /** La conséquence du tri, et la raison d'être du tri. */
  it("donne la MÊME empreinte quel que soit l'ordre de lecture", () => {
    const one = buildRevision(HEADER, [item({ sku: "A" }), item({ sku: "B" })]);
    const other = buildRevision(HEADER, [item({ sku: "B" }), item({ sku: "A" })]);

    expect(one.hash).toBe(other.hash);
  });

  it("change d'empreinte dès qu'un article change", () => {
    const before = buildRevision(HEADER, [item()]);
    const after = buildRevision(HEADER, [item({ priceCents: 130 })]);

    expect(after.hash).not.toBe(before.hash);
    expect(after.items[0]?.hash).not.toBe(before.items[0]?.hash);
  });

  /**
   * **Le cas qui a décidé de l'en-tête.** Le rapport pro est global : quand il
   * bouge, aucune ligne d'article ne change et toutes les factures
   * professionnelles changent. Une empreinte qui ne le couvrirait pas dirait
   * « rien n'a bougé » — le pire des mensonges pour une ancre.
   */
  it("change d'empreinte quand SEUL le rapport pro bouge", () => {
    const before = buildRevision({ proRatioBp: 9_000 }, [item()]);
    const after = buildRevision({ proRatioBp: 8_800 }, [item()]);

    expect(after.hash).not.toBe(before.hash);
    // Et les articles, eux, sont INCHANGÉS : c'est ce qui permet au magasin de
    // les partager entre les deux révisions.
    expect(after.items[0]?.hash).toBe(before.items[0]?.hash);
  });

  it("garde les visuels par leur adresse, jamais par leurs octets", () => {
    const built = buildRevision(HEADER, [item()]);
    const media = built.items[0]?.payload["media"];

    expect(media).toEqual([
      { role: "gallery", url: "https://cdn.test/a.jpg", alt: { fr: "Un croissant" } },
    ]);
  });

  /** Trois états distincts, et les confondre est la seule faute qui compte ici. */
  it("distingue « pas de fiche » de « fiche sans allergène »", () => {
    const none = buildRevision(HEADER, [item({ allergens: null })]);
    const empty = buildRevision(HEADER, [item({ allergens: [] })]);

    expect(none.hash).not.toBe(empty.hash);
  });
});
