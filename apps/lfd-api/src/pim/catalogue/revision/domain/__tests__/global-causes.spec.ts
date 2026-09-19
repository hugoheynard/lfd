import { PIM_EVENTS } from "../../../../journal/pim-journal.js";
import type { PimJournalFact } from "../../../../journal/pim-journal-reader.js";
import { causesOf } from "../global-causes.js";

function fact(over: Partial<PimJournalFact> & Pick<PimJournalFact, "type">): PimJournalFact {
  return {
    subjectType: "vat_rate",
    subjectId: "vat_1",
    occurredAt: new Date("2026-08-31T10:00:00.000Z"),
    actorName: "Hugo Heynard",
    payload: {},
    ...over,
  };
}

describe("causesOf — la phrase d'une cause globale", () => {
  /**
   * Régression (lot B du plan des phrases, 2026-09-19) : l'écran de diff des
   * révisions affichait l'identifiant de la famille pour `product_category.moved`,
   * faute de lire le nom que le fait porte depuis.
   */
  it("dit une famille déplacée par son nom et ceux de ses parents", () => {
    const [cause] = causesOf([
      fact({
        type: PIM_EVENTS.productCategoryMoved,
        subjectType: "product_category",
        subjectId: "cat_tartes",
        payload: {
          subjectLabel: "Tartes",
          parent: { from: { id: "cat_sucre", name: "Sucré" }, to: null },
        },
      }),
    ]);

    expect(cause?.label).toBe("Tartes : Sucré → aucune");
  });

  it("dit un taux par son nom et ses deux valeurs, comme avant le lot B", () => {
    const [cause] = causesOf([
      fact({
        type: PIM_EVENTS.vatRateRateChanged,
        subjectType: "vat_rate",
        subjectId: "vat_1",
        payload: { subjectLabel: "Taux réduit", name: "Taux réduit", from: 5.5, to: 10 },
      }),
    ]);

    expect(cause?.label).toBe("Taux réduit : 5.5 → 10");
  });

  it("se rabat sur l'identifiant d'une ligne ancienne qui n'a pas de nom", () => {
    const [cause] = causesOf([
      fact({
        type: PIM_EVENTS.productCategoryMoved,
        subjectType: "product_category",
        subjectId: "cat_tartes",
        payload: { parentId: { from: "cat_sucre", to: null } },
      }),
    ]);

    expect(cause?.label).toBe("cat_tartes : cat_sucre → aucune");
  });
});

describe("causesOf — la portée, nommée par contexte", () => {
  const RATE_CHANGED = {
    subjectLabel: "Taux réduit",
    name: "Taux réduit",
    from: 5.5,
    to: 10,
    blast: { families: { brunch: 2, takeaway: 1 } },
  };

  /**
   * Régression (TODO des phrases, 2026-09-19) : l'écran de diff des révisions
   * affichait « brunch : 1 » — la clé du contexte, pas son nom — alors que le
   * fait porte le libellé du moment depuis le lot D.
   */
  it("rend le libellé du moment de chaque contexte que la portée compte", () => {
    const [cause] = causesOf([
      fact({
        type: PIM_EVENTS.vatRateRateChanged,
        payload: { ...RATE_CHANGED, contextLabels: { brunch: "Brunch", takeaway: "À emporter" } },
      }),
    ]);

    expect(cause?.blast).toEqual({ brunch: 2, takeaway: 1 });
    expect(cause?.contextLabels).toEqual({ brunch: "Brunch", takeaway: "À emporter" });
  });

  it("ne résout pas aujourd'hui le nom d'une ligne d'avant qui n'en portait pas (D5)", () => {
    const [cause] = causesOf([
      fact({ type: PIM_EVENTS.vatRateRateChanged, payload: RATE_CHANGED }),
    ]);

    expect(cause?.blast).toEqual({ brunch: 2, takeaway: 1 });
    expect(cause?.contextLabels).toEqual({});
  });

  it("ne nomme que les clés comptées, et tait un libellé vide", () => {
    const [cause] = causesOf([
      fact({
        type: PIM_EVENTS.vatRateRateChanged,
        payload: {
          ...RATE_CHANGED,
          contextLabels: { brunch: "", takeaway: "À emporter", eatIn: "Sur place" },
        },
      }),
    ]);

    expect(cause?.contextLabels).toEqual({ takeaway: "À emporter" });
  });

  it("rend une carte vide pour un fait sans portée", () => {
    const [cause] = causesOf([
      fact({
        type: PIM_EVENTS.vatRateDeleted,
        payload: { subjectLabel: "Taux réduit", name: "Taux réduit", percent: 5.5 },
      }),
    ]);

    expect(cause?.blast).toEqual({});
    expect(cause?.contextLabels).toEqual({});
  });
});
