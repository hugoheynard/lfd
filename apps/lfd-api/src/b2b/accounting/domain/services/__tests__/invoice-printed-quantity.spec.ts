import { thousandthsQuantity } from "../facturx-format.js";
import { quantityLabel } from "../invoice-pdf-wording.js";
import { printedQuantity } from "../invoice-printed-quantity.js";

/**
 * La quantité imprimée (plan `vente-au-poids.md`, § 3 bis, point 6) :
 * toujours trois décimales au kilo, la pièce entière ; BT-129 inchangé.
 */
describe("printedQuantity", () => {
  it.each([
    [1_250, "KGM", "1.250"],
    [2_000, "KGM", "2.000"],
    [20, "KGM", "0.020"],
    [1, "KGM", "0.001"],
    [1_000_000, "KGM", "1000.000"],
    [12_000, "H87", "12"],
  ] as const)("%i millièmes de %s → %s", (thousandths, unit, expected) => {
    expect(printedQuantity(thousandths, unit)).toBe(expected);
  });
});

describe("quantityLabel — le PDF", () => {
  it("dit « 1,250 kg » et « 2,000 kg », jamais « 1,25 » ni « 2 »", () => {
    expect(quantityLabel({ quantityThousandths: 1_250, unitCode: "KGM" })).toBe("1,250 kg");
    expect(quantityLabel({ quantityThousandths: 2_000, unitCode: "KGM" })).toBe("2,000 kg");
  });

  it("groupe les milliers d'une tonne à l'insécable : « 1 000,000 kg »", () => {
    expect(quantityLabel({ quantityThousandths: 1_000_000, unitCode: "KGM" })).toBe("1 000,000 kg");
  });

  it("garde « 12 pièce(s) » pour une pièce", () => {
    expect(quantityLabel({ quantityThousandths: 12_000, unitCode: "H87" })).toBe("12 pièce(s)");
  });
});

describe("thousandthsQuantity — BT-129, laissé intact", () => {
  it("écrit encore sans zéro superflu : 1.25 et 2", () => {
    expect(thousandthsQuantity(1_250)).toBe("1.25");
    expect(thousandthsQuantity(2_000)).toBe("2");
  });
});
