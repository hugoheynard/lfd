import {
  percentile,
  PRICING_P95_THRESHOLD_MS,
  pricingProbeRows,
  pricingState,
  type PricingSample,
} from "../pricing-probe.js";

const sample = (ms: number, caller = "cart", audience = "pro", size = 1): PricingSample => ({
  labels: { caller, audience },
  ms,
  size,
});

describe("pricingState — le seuil du p95", () => {
  it("juge aux bornes : ok, attention à 80 %, dépassé dès le seuil atteint", () => {
    expect(pricingState(0)).toBe("ok");
    expect(pricingState(PRICING_P95_THRESHOLD_MS * 0.8 - 1)).toBe("ok");
    expect(pricingState(PRICING_P95_THRESHOLD_MS * 0.8)).toBe("attention");
    expect(pricingState(PRICING_P95_THRESHOLD_MS - 1)).toBe("attention");
    expect(pricingState(PRICING_P95_THRESHOLD_MS)).toBe("exceeded");
  });
});

describe("percentile — plus proche rang", () => {
  it("ne fabrique pas de valeur entre deux mesures", () => {
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(20);
    expect(percentile([10, 20, 30, 40], 0.95)).toBe(40);
    expect(percentile([], 0.95)).toBe(0);
  });
});

describe("pricingProbeRows — la carte par appelant et audience", () => {
  it("ne rend aucune ligne sans mesure : un « 0 ms » se lirait comme un calcul gratuit", () => {
    expect(pricingProbeRows([])).toEqual([]);
  });

  it("compte les lots, rend p50, p95 et la taille moyenne d'un lot", () => {
    const rows = pricingProbeRows([
      sample(10, "cart", "pro", 2),
      sample(20, "cart", "pro", 3),
      sample(400, "cart", "pro", 4),
    ]);

    expect(rows).toEqual([
      {
        caller: "cart",
        audience: "pro",
        lots: 3,
        p50Ms: 20,
        p95Ms: 400,
        meanItems: 3,
        state: "exceeded",
      },
    ]);
  });

  it("sépare les audiences d'un même appelant, et range le plus lent d'abord", () => {
    const rows = pricingProbeRows([
      sample(5, "shelf", "public"),
      sample(50, "shelf", "pro"),
      sample(30, "checkout", "pro"),
    ]);

    expect(rows.map((row) => [row.caller, row.audience])).toEqual([
      ["shelf", "pro"],
      ["checkout", "pro"],
      ["shelf", "public"],
    ]);
  });

  it("nomme une étiquette absente au lieu de la ranger sous un autre appelant", () => {
    const rows = pricingProbeRows([{ labels: {}, ms: 1, size: 1 }]);

    expect(rows[0]).toMatchObject({ caller: "?", audience: "?" });
  });

  it("arrondit la moyenne au dixième et les durées à la milliseconde", () => {
    const rows = pricingProbeRows([sample(1.4, "cart", "pro", 1), sample(1.6, "cart", "pro", 2)]);

    expect(rows[0]).toMatchObject({ p50Ms: 1, p95Ms: 2, meanItems: 1.5 });
  });
});
