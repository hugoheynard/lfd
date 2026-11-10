/**
 * **Une décision tarifaire ne vise que ce qui se vend** (L5 de
 * `plan-pro-voit-les-declinaisons.md`). Avant, une faute de frappe posait une
 * décision qui ne s'appliquait jamais, sans un mot.
 */
import type { SaleReferenceStanding } from "../../ports/sale-reference.reader.js";
import {
  SaleReferenceNotOnSaleError,
  SaleReferenceNotSoldToProsError,
  SaleReferenceNotSoldToPublicError,
  SaleReferenceWithdrawnError,
} from "../../pricing-errors.js";
import { clienteleOfAudience, ensureOnSale, saleReferenceOf } from "../sale-references.js";

const standings = new Map<string, SaleReferenceStanding>([
  ["VIE-001", "on_sale"],
  ["VIE-001-2", "on_sale"],
  ["PAI-009", "withdrawn"],
  ["TAR-002", "public_only"],
  ["FOU-003", "pro_only"],
]);

describe("ensureOnSale", () => {
  it("accepte des références en vente, défaut comme déclinaison", () => {
    expect(() => ensureOnSale(["VIE-001", "VIE-001-2"], standings, "any")).not.toThrow();
  });

  it("refuse une référence inconnue en la nommant", () => {
    expect(() => ensureOnSale(["VIE-01"], standings, "any")).toThrow(SaleReferenceNotOnSaleError);
    expect(() => ensureOnSale(["VIE-01"], standings, "any")).toThrow(
      /« VIE-01 » n'est pas en vente/,
    );
  });

  it("nomme toutes les inconnues d'une grille, une seule fois chacune, et aucune connue", () => {
    const refusal = (() => {
      try {
        ensureOnSale(["VIE-001", "XX-1", "XX-2", "XX-1"], standings, "any");
      } catch (error) {
        return error;
      }
      return null;
    })();
    expect(refusal).toBeInstanceOf(SaleReferenceNotOnSaleError);
    expect(refusal).toMatchObject({ skus: ["XX-1", "XX-2"] });
  });

  it("refuse un article retiré avec son propre message", () => {
    expect(() => ensureOnSale(["PAI-009"], standings, "any")).toThrow(SaleReferenceWithdrawnError);
    expect(() => ensureOnSale(["PAI-009"], standings, "any")).toThrow(/retiré du catalogue/);
  });

  it("dit l'inconnue avant le retiré : la faute de frappe se corrige d'abord", () => {
    expect(() => ensureOnSale(["PAI-009", "XX-1"], standings, "any")).toThrow(
      SaleReferenceNotOnSaleError,
    );
  });
});

/**
 * Hugo, 2026-10-29 : une décision PRO exige la vente AUX PROS. Avant, être
 * vendu aux seuls particuliers suffisait, et une mercuriale posée dessus ne
 * s'appliquait jamais.
 */
describe("ensureOnSale — la clientèle de la décision", () => {
  it("refuse une décision pro sur un article vendu aux seuls particuliers, avec le message nommé", () => {
    expect(() => ensureOnSale(["TAR-002"], standings, "pro")).toThrow(
      SaleReferenceNotSoldToProsError,
    );
    expect(() => ensureOnSale(["TAR-002"], standings, "pro")).toThrow(
      "L'article « TAR-002 » n'est pas en vente aux professionnels : une décision pro posée dessus ne s'appliquerait jamais. Ouvrez-le aux pros (prix pro, audience, validation pro), ou choisissez un autre article.",
    );
  });

  it("accepte une décision pro sur un article vendu aux deux clientèles, ou aux seuls pros", () => {
    expect(() => ensureOnSale(["VIE-001", "FOU-003"], standings, "pro")).not.toThrow();
  });

  it("accepte une décision des particuliers sur un article public", () => {
    expect(() => ensureOnSale(["TAR-002", "VIE-001"], standings, "public")).not.toThrow();
  });

  it("refuse une décision des particuliers sur un article vendu aux seuls pros", () => {
    expect(() => ensureOnSale(["FOU-003"], standings, "public")).toThrow(
      SaleReferenceNotSoldToPublicError,
    );
  });

  it("accepte une décision « toutes clientèles » dès qu'une clientèle achète", () => {
    expect(() => ensureOnSale(["TAR-002", "FOU-003"], standings, "any")).not.toThrow();
  });

  it("dit le retiré avant la clientèle", () => {
    expect(() => ensureOnSale(["TAR-002", "PAI-009"], standings, "pro")).toThrow(
      SaleReferenceWithdrawnError,
    );
  });
});

describe("clienteleOfAudience", () => {
  it("rend pro pour une société ou un segment, toutes pour « all »", () => {
    expect(clienteleOfAudience({ type: "company", id: "co_1" })).toBe("pro");
    expect(clienteleOfAudience({ type: "segment", id: "seg_1" })).toBe("pro");
    expect(clienteleOfAudience({ type: "all", id: null })).toBe("any");
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
