import { AccountingRules } from "../accounting-rules.js";
import { InvalidProPriceRatioError } from "../../errors/accounting-rules-errors.js";

describe("AccountingRules", () => {
  /** Lot S : une ligne neuve naît sur le prix saisi, ce que la base valait sans elle. */
  it("s'ouvre sur un rapport valide, en « prix saisi »", () => {
    expect(AccountingRules.open(9_000).snapshot()).toEqual({
      proPriceMethod: "entered",
      proPriceRatioBp: 9_000,
    });
  });

  it("refuse de s'ouvrir sur un rapport impossible", () => {
    expect(() => AccountingRules.open(12_000)).toThrow(InvalidProPriceRatioError);
  });

  it("révise son rapport", () => {
    const rules = AccountingRules.open(9_000);
    rules.setProPriceRatio(8_500);
    expect(rules.snapshot()).toEqual({
      proPriceMethod: "entered",
      proPriceRatioBp: 8_500,
    });
  });

  it("refuse une révision impossible et garde le rapport d'avant", () => {
    const rules = AccountingRules.open(9_000);
    expect(() => rules.setProPriceRatio(0)).toThrow(InvalidProPriceRatioError);
    expect(rules.snapshot()).toEqual({
      proPriceMethod: "entered",
      proPriceRatioBp: 9_000,
    });
  });

  /**
   * Une ligne écrite avant que la borne existe — ou par un script de reprise —
   * se signale à la reconstitution, plutôt que de ressortir telle quelle et de
   * tarifer le catalogue entier.
   */
  it("refait passer un rapport relu par son VO", () => {
    expect(() =>
      AccountingRules.reconstitute({
        proPriceMethod: "ratio_ttc",
        proPriceRatioBp: 15_000,
      }),
    ).toThrow(InvalidProPriceRatioError);
  });

  /**
   * Régression (BLOQUANT `vitruve`, lot S) : sans ligne, la politique valait
   * `null` et rien ne se vendait, saisies comprises.
   */
  it("vaut « prix saisi » sans rapport quand rien n'est réglé", () => {
    expect(AccountingRules.effectivePolicy(null)).toEqual({ method: "entered", ratioBp: null });
  });

  it("rend sa propre politique quand la ligne existe — une base existante garde sa méthode", () => {
    const rules = AccountingRules.reconstitute({
      proPriceMethod: "ratio_ttc",
      proPriceRatioBp: 9_000,
    });
    expect(AccountingRules.effectivePolicy(rules)).toEqual({
      method: "ratio_ttc",
      ratioBp: 9_000,
    });
  });
});
