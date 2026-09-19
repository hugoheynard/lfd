import { limitScopeLabel } from "../limit-scope-label.js";

/** La portée d'une limite en mots, telle que ses faits la figent au journal. */
describe("limitScopeLabel", () => {
  it("dit « Toute la production » pour la portée globale", () => {
    expect(limitScopeLabel({ type: "global", id: null }, null)).toBe("Toute la production");
  });

  it("nomme la cible par son nom du moment", () => {
    expect(limitScopeLabel({ type: "category", id: "cat_1" }, "Tartes")).toBe("Famille « Tartes »");
    expect(limitScopeLabel({ type: "product", id: "prd_1" }, "VIE-001")).toBe(
      "Produit « VIE-001 »",
    );
  });

  it("garde l'identifiant d'une cible sans nom — jamais un nom inventé", () => {
    expect(limitScopeLabel({ type: "variant", id: "var_9" }, null)).toBe("Déclinaison var_9");
    expect(limitScopeLabel({ type: "category", id: "cat_2" }, "")).toBe("Famille cat_2");
  });
});
