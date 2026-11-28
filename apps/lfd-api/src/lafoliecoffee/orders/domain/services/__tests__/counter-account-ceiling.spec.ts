import { exceedsCounterCeiling } from "../counter-account-ceiling.js";

describe("exceedsCounterCeiling", () => {
  it("n'arrête rien sans plafond", () => {
    expect(exceedsCounterCeiling(1_000_000, 1_000_000, null)).toBe(false);
  });

  it("admet l'encours plus la commande égal au plafond", () => {
    expect(exceedsCounterCeiling(30_000, 20_000, 50_000)).toBe(false);
  });

  it("refuse dès un centime au-dessus", () => {
    expect(exceedsCounterCeiling(30_000, 20_001, 50_000)).toBe(true);
  });

  it("refuse une première commande déjà au-dessus d'un plafond nul", () => {
    expect(exceedsCounterCeiling(0, 1, 0)).toBe(true);
  });
});
