import type { HistoryFact } from "../../../../journal/product-history-journal.js";
import {
  HistoryFactOutsideLineageError,
  ProductHistoryMap,
  type ProductLineage,
} from "../product-lineage.js";

const LINEAGE: ProductLineage = {
  productId: "prd_1",
  categories: [
    { id: "cat_tartes", label: "Tartes" },
    { id: "cat_patisserie", label: "Pâtisserie" },
  ],
  vatRates: [{ id: "vat_55", label: "Taux réduit" }],
  ingredients: [{ id: "beurre", label: "Beurre" }],
  appellations: [{ id: "aop-charentes", label: "AOP Charentes-Poitou" }],
  revisions: [{ id: "rev_1", hash: "h_1" }],
};

function fact(subjectType: string, subjectId: string): HistoryFact {
  return {
    id: "evt_1",
    type: `${subjectType}.something`,
    subjectType,
    subjectId,
    occurredAt: new Date(0),
    actorName: null,
    actorType: "staff",
    payload: {},
  };
}

describe("ProductHistoryMap — les fils", () => {
  it("lit les faits de la fiche et de ses déclinaisons par PRÉFIXE, jamais par son seul sujet", () => {
    const { threads } = ProductHistoryMap.of(LINEAGE);

    expect(threads.slice(0, 2)).toEqual([
      { subjectType: "product", subjectIds: ["prd_1"], types: { prefix: "product." } },
      { subjectType: "product", subjectIds: ["prd_1"], types: { prefix: "variant." } },
    ]);
  });

  it("tire un fil par héritage, famille ET ancêtres compris", () => {
    const { threads } = ProductHistoryMap.of(LINEAGE);

    expect(threads).toEqual(
      expect.arrayContaining([
        {
          subjectType: "product_category",
          subjectIds: ["cat_tartes", "cat_patisserie"],
          types: { prefix: "product_category." },
        },
        { subjectType: "vat_rate", subjectIds: ["vat_55"], types: { prefix: "vat_rate." } },
        { subjectType: "ingredient", subjectIds: ["beurre"], types: { prefix: "ingredient." } },
        {
          subjectType: "appellation",
          subjectIds: ["aop-charentes"],
          types: { prefix: "appellation." },
        },
      ]),
    );
  });

  /** Une révision prise s'adresse par son empreinte, une révision poussée par son id. */
  it("lit une révision sous ses deux adresses, chacune avec son seul type", () => {
    const { threads } = ProductHistoryMap.of(LINEAGE);

    expect(threads).toEqual(
      expect.arrayContaining([
        {
          subjectType: "catalog_revision",
          subjectIds: ["h_1"],
          types: { exactly: ["catalog_revision.taken"] },
        },
        {
          subjectType: "catalog_revision",
          subjectIds: ["rev_1"],
          types: { exactly: ["catalog_revision.pushed"] },
        },
      ]),
    );
  });

  it("ne tire aucun fil vide : une fiche sans ingrédient n'en demande pas", () => {
    const { threads } = ProductHistoryMap.of({
      ...LINEAGE,
      vatRates: [],
      ingredients: [],
      appellations: [],
      revisions: [],
    });

    expect(threads.map((thread) => thread.subjectType)).toEqual([
      "product",
      "product",
      "product_category",
    ]);
  });
});

describe("ProductHistoryMap — les cercles", () => {
  const map = ProductHistoryMap.of(LINEAGE);

  it("range un fait de la fiche dans son propre cercle", () => {
    expect(map.place(fact("product", "prd_1"))).toEqual({ circle: "product" });
  });

  it("range un fait d'un ancêtre en « hérité », nommé", () => {
    expect(map.place(fact("product_category", "cat_patisserie"))).toEqual({
      circle: "inherited",
      inheritedFrom: { kind: "category", id: "cat_patisserie", label: "Pâtisserie" },
    });
  });

  it("nomme un taux, un ingrédient et une appellation par ce qu'ils sont", () => {
    expect(map.place(fact("vat_rate", "vat_55"))).toMatchObject({
      inheritedFrom: { kind: "vat_rate", label: "Taux réduit" },
    });
    expect(map.place(fact("ingredient", "beurre"))).toMatchObject({
      inheritedFrom: { kind: "ingredient", id: "beurre" },
    });
    expect(map.place(fact("appellation", "aop-charentes"))).toMatchObject({
      inheritedFrom: { kind: "appellation", id: "aop-charentes" },
    });
  });

  it("range une révision, prise comme poussée, dans le cercle des révisions", () => {
    expect(map.place(fact("catalog_revision", "h_1"))).toEqual({ circle: "revision" });
    expect(map.place(fact("catalog_revision", "rev_1"))).toEqual({ circle: "revision" });
  });

  it("refuse un fait qu'aucun fil ne demandait plutôt que d'inventer son cercle", () => {
    expect(() => map.place(fact("vat_rate", "vat_20"))).toThrow(HistoryFactOutsideLineageError);
    // Même identifiant, autre sorte de sujet : ce n'est pas le même fil.
    expect(() => map.place(fact("product", "cat_tartes"))).toThrow(HistoryFactOutsideLineageError);
  });
});
