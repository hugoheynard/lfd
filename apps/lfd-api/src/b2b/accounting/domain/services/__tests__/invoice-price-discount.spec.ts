import {
  priceDiscountNote,
  priceDiscountPercentLabel,
  promotionPriceDiscountOf,
  type FrozenLinePricingTrace,
} from "../invoice-price-discount.js";

/** La remise d'une promotion lue dans la trace figée (plan `plan-remise-par-ligne.md`, § 18.6). */

const PROMOTION = { stage: "promotion", label: "Printemps", resultMillicents: 81_840 };

function trace(overrides: Partial<FrozenLinePricingTrace> = {}): FrozenLinePricingTrace {
  return {
    basePriceMillicents: 93_000,
    steps: [PROMOTION],
    floored: false,
    clampedToZero: false,
    ...overrides,
  };
}

describe("promotionPriceDiscountOf", () => {
  it("rend le prix d'entrée de l'étage promotion et le nom de la promotion", () => {
    expect(promotionPriceDiscountOf(trace(), 81_840)).toEqual({
      grossUnitPriceMillicents: 93_000,
      labels: ["Printemps"],
    });
  });

  it("le brut est le prix au sortir de l'étage précédent (une mercuriale)", () => {
    const steps = [
      { stage: "mercuriale", label: "M", resultMillicents: 90_000 },
      { ...PROMOTION, resultMillicents: 79_200 },
    ];

    expect(promotionPriceDiscountOf(trace({ steps }), 79_200)?.grossUnitPriceMillicents).toBe(
      90_000,
    );
  });

  it("deux promotions cumulées : le brut est avant la première, les deux noms sont dits", () => {
    const steps = [
      { ...PROMOTION, resultMillicents: 83_700 },
      { stage: "promotion", label: "Fidèles", resultMillicents: 79_515 },
    ];

    expect(promotionPriceDiscountOf(trace({ steps }), 79_515)).toEqual({
      grossUnitPriceMillicents: 93_000,
      labels: ["Printemps", "Fidèles"],
    });
  });

  it.each([
    ["sans trace", null],
    ["relevé par un plancher", trace({ floored: true })],
    ["ramené à zéro", trace({ clampedToZero: true })],
    ["trace d'avant la consignation", trace({ clampedToZero: null })],
    [
      "un geste après la promotion",
      trace({ steps: [PROMOTION, { stage: "geste", label: "G", resultMillicents: 81_840 }] }),
    ],
    [
      "aucune promotion",
      trace({ steps: [{ stage: "mercuriale", label: "M", resultMillicents: 81_840 }] }),
    ],
  ])("se tait : %s", (_, input) => {
    expect(promotionPriceDiscountOf(input, 81_840)).toBeNull();
  });

  it("se tait quand le dernier prix de la trace n'est pas celui de la ligne", () => {
    expect(promotionPriceDiscountOf(trace(), 80_000)).toBeNull();
  });
});

describe("le taux et la phrase", () => {
  it("12 % sur 0,93 € → 0,8184 €, sans décimale inutile", () => {
    expect(priceDiscountPercentLabel(93_000, 81_840)).toBe("12 %");
  });

  it("deux décimales au plus, virgule française", () => {
    expect(priceDiscountPercentLabel(93_000, 83_000)).toBe("10,75 %");
  });

  it("la phrase nomme le taux et la promotion", () => {
    expect(
      priceDiscountNote(81_840, { grossUnitPriceMillicents: 93_000, labels: ["Printemps"] }),
    ).toBe("Remise 12 % : Printemps");
  });
});
