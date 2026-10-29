/**
 * **Une décision tarifaire ne vise que ce qui se vend** (L5 de
 * `plan-pro-voit-les-declinaisons.md`). Avant, une faute de frappe posait une
 * décision qui ne s'appliquait jamais, sans un mot.
 */
import type { SaleReferenceStanding } from "../../ports/sale-reference.reader.js";
import { SaleReferenceNotOnSaleError, SaleReferenceWithdrawnError } from "../../pricing-errors.js";
import { ensureOnSale, saleReferenceOf } from "../sale-references.js";

const standings = new Map<string, SaleReferenceStanding>([
  ["VIE-001", "on_sale"],
  ["VIE-001-2", "on_sale"],
  ["PAI-009", "withdrawn"],
]);

describe("ensureOnSale", () => {
  it("accepte des références en vente, défaut comme déclinaison", () => {
    expect(() => ensureOnSale(["VIE-001", "VIE-001-2"], standings)).not.toThrow();
  });

  it("refuse une référence inconnue en la nommant", () => {
    expect(() => ensureOnSale(["VIE-01"], standings)).toThrow(SaleReferenceNotOnSaleError);
    expect(() => ensureOnSale(["VIE-01"], standings)).toThrow(/« VIE-01 » n'est pas en vente/);
  });

  it("nomme toutes les inconnues d'une grille, une seule fois chacune, et aucune connue", () => {
    const refusal = (() => {
      try {
        ensureOnSale(["VIE-001", "XX-1", "XX-2", "XX-1"], standings);
      } catch (error) {
        return error;
      }
      return null;
    })();
    expect(refusal).toBeInstanceOf(SaleReferenceNotOnSaleError);
    expect(refusal).toMatchObject({ skus: ["XX-1", "XX-2"] });
  });

  it("refuse un article retiré avec son propre message", () => {
    expect(() => ensureOnSale(["PAI-009"], standings)).toThrow(SaleReferenceWithdrawnError);
    expect(() => ensureOnSale(["PAI-009"], standings)).toThrow(/retiré du catalogue/);
  });

  it("dit l'inconnue avant le retiré : la faute de frappe se corrige d'abord", () => {
    expect(() => ensureOnSale(["PAI-009", "XX-1"], standings)).toThrow(SaleReferenceNotOnSaleError);
  });
});

describe("saleReferenceOf", () => {
  it("rend le SKU d'une portée produit ou déclinaison, rien pour une famille ou le global", () => {
    expect(saleReferenceOf({ type: "product", id: "VIE-001" })).toBe("VIE-001");
    expect(saleReferenceOf({ type: "variant", id: "VIE-001-2" })).toBe("VIE-001-2");
    expect(saleReferenceOf({ type: "category", id: "cat_vie" })).toBeNull();
    expect(saleReferenceOf({ type: "global", id: null })).toBeNull();
  });
});
