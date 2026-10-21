import { frenchDay, periodSentence } from "../order-summary-period.js";

/**
 * La période imprimée sur le récapitulatif (plan
 * `documentation/commandes/plan-recapitulatif-des-commandes.md`, §9) : des jours
 * comparés entre eux seulement, jamais à l'horloge.
 */
describe("la période du récapitulatif", () => {
  it("dit le premier du mois « 1er »", () => {
    expect(frenchDay("2026-10-01")).toBe("1er octobre 2026");
    expect(frenchDay("2026-08-15")).toBe("15 août 2026");
  });

  it("dit le mois et l'année une fois quand ils sont communs", () => {
    expect(periodSentence({ from: "2026-10-01", to: "2026-10-15" })).toBe(
      "Retraits et livraisons du 1er au 15 octobre 2026",
    );
    expect(periodSentence({ from: "2026-09-28", to: "2026-10-04" })).toBe(
      "Retraits et livraisons du 28 septembre au 4 octobre 2026",
    );
    expect(periodSentence({ from: "2026-12-28", to: "2027-01-03" })).toBe(
      "Retraits et livraisons du 28 décembre 2026 au 3 janvier 2027",
    );
  });

  it("un seul jour, une seule borne, aucune", () => {
    expect(periodSentence({ from: "2026-10-03", to: "2026-10-03" })).toBe(
      "Retraits et livraisons le 3 octobre 2026",
    );
    expect(periodSentence({ from: "2026-10-01", to: null })).toBe(
      "Retraits et livraisons à partir du 1er octobre 2026",
    );
    expect(periodSentence({ from: null, to: "2026-10-15" })).toBe(
      "Retraits et livraisons jusqu'au 15 octobre 2026",
    );
    expect(periodSentence({ from: null, to: null })).toBeNull();
    expect(periodSentence(null)).toBeNull();
  });
});
