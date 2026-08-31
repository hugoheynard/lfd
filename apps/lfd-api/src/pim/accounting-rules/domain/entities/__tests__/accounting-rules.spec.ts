import { AccountingRules } from "../accounting-rules.js";
import { InvalidProPriceRatioError } from "../../errors/accounting-rules-errors.js";

describe("AccountingRules", () => {
  it("s'ouvre sur un rapport valide", () => {
    expect(AccountingRules.open(9_000).snapshot()).toEqual({ proPriceRatioBp: 9_000 });
  });

  it("refuse de s'ouvrir sur un rapport impossible", () => {
    expect(() => AccountingRules.open(12_000)).toThrow(InvalidProPriceRatioError);
  });

  it("révise son rapport", () => {
    const rules = AccountingRules.open(9_000);
    rules.setProPriceRatio(8_500);
    expect(rules.snapshot()).toEqual({ proPriceRatioBp: 8_500 });
  });

  it("refuse une révision impossible et garde le rapport d'avant", () => {
    const rules = AccountingRules.open(9_000);
    expect(() => rules.setProPriceRatio(0)).toThrow(InvalidProPriceRatioError);
    expect(rules.snapshot()).toEqual({ proPriceRatioBp: 9_000 });
  });

  /**
   * Une ligne écrite avant que la borne existe — ou par un script de reprise —
   * se signale à la reconstitution, plutôt que de ressortir telle quelle et de
   * tarifer le catalogue entier.
   */
  it("refait passer un rapport relu par son VO", () => {
    expect(() => AccountingRules.reconstitute({ proPriceRatioBp: 15_000 })).toThrow(
      InvalidProPriceRatioError,
    );
  });
});
