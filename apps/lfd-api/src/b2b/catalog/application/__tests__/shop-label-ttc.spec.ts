import { shopCatalogueOf, ttcCentsFromHtMillicentsFor } from "../shop-catalogue-view.js";
import { catalogItem } from "./sale-operations-doubles.js";

/**
 * L'étiquette d'un particulier est la valeur saisie (plan
 * `documentation/pricing/plan-centime-particuliers.md`, § 4, lot C3) ; celle
 * du pro ne bouge pas.
 */

/** Saisi 1,53 € TTC à 20 % au référentiel : HT résolu 1,275 €. */
const SAISI_153 = 127_500;

describe("ttcCentsFromHtMillicentsFor — l'étiquette selon la clientèle", () => {
  it("public : la valeur saisie, 1,53 €", () => {
    expect(ttcCentsFromHtMillicentsFor(SAISI_153, 20, "public")).toBe(153);
  });

  it("pro : inchangé, le HT arrondi d'abord (1,28 € → 1,54 €)", () => {
    expect(ttcCentsFromHtMillicentsFor(SAISI_153, 20, "pro")).toBe(154);
  });

  it("banana bread à 21,00 € : 21,00 € pour un particulier", () => {
    expect(ttcCentsFromHtMillicentsFor(1_990_521, 5.5, "public")).toBe(2_100);
  });
});

describe("shopCatalogueOf — la vignette suit l'audience de la vente", () => {
  const sellable = [catalogItem("SOD-001", { unitPriceMillicents: SAISI_153, vatRate: 20 })];
  const sale = { operations: [], operationOnlySkus: new Set<string>(), now: new Date(0) };

  it("public : 1,53 €", () => {
    const view = shopCatalogueOf(sellable, { ...sale, audience: "public" });
    expect(view.items[0]?.unitPriceTtcCents).toBe(153);
  });

  it("pro : 1,54 €, comme avant", () => {
    const view = shopCatalogueOf(sellable, { ...sale, audience: "pro" });
    expect(view.items[0]?.unitPriceTtcCents).toBe(154);
  });
});
