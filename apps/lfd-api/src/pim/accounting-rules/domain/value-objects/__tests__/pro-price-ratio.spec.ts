import { ProPriceRatio } from "../pro-price-ratio.js";
import { InvalidProPriceRatioError } from "../../errors/accounting-rules-errors.js";

describe("ProPriceRatio", () => {
  it("accepte un rapport entre 1 point de base et 100 %", () => {
    expect(ProPriceRatio.create(9_000).basisPoints).toBe(9_000);
    expect(ProPriceRatio.create(10_000).basisPoints).toBe(10_000);
    expect(ProPriceRatio.create(1).basisPoints).toBe(1);
  });

  /**
   * Le professionnel qui paierait plus cher que le particulier n'est pas une
   * politique commerciale : c'est une faute de frappe, et elle surfacturerait
   * tout le catalogue d'un coup.
   */
  it("refuse un rapport au-dessus de 100 %", () => {
    expect(() => ProPriceRatio.create(10_001)).toThrow(InvalidProPriceRatioError);
  });

  it("refuse zéro et le négatif — un prix pro gratuit n'est pas un rapport", () => {
    expect(() => ProPriceRatio.create(0)).toThrow(InvalidProPriceRatioError);
    expect(() => ProPriceRatio.create(-9_000)).toThrow(InvalidProPriceRatioError);
  });

  /**
   * Un rapport fractionnaire est le symptôme d'un appelant qui a converti un
   * pourcentage en flottant avant d'arriver ici — donc qui a déjà perdu de la
   * précision. On refuse au lieu d'arrondir en silence.
   */
  it("refuse un rapport non entier", () => {
    expect(() => ProPriceRatio.create(9_000.5)).toThrow(InvalidProPriceRatioError);
    expect(() => ProPriceRatio.create(Number.NaN)).toThrow(InvalidProPriceRatioError);
  });

  it("dérive le prix pro TTC d'un prix public TTC", () => {
    expect(ProPriceRatio.create(9_000).applyTo(1_000)).toBe(900);
    expect(ProPriceRatio.create(10_000).applyTo(1_234)).toBe(1_234);
  });

  /**
   * Multiplier d'abord, diviser ensuite, arrondir une seule fois : la fraction
   * intermédiaire (99,99 et 174,125 ici) doit survivre jusqu'au dernier geste.
   * Un arrondi posé plus tôt les figerait sur des valeurs différentes.
   */
  it("n'arrondit qu'une fois, en fin de calcul", () => {
    expect(ProPriceRatio.create(3_333).applyTo(300)).toBe(100);
    expect(ProPriceRatio.create(8_750).applyTo(199)).toBe(174);
  });

  it("arrondit au plus proche, pas systématiquement vers le bas", () => {
    // 250 × 90 % = 225 pile ; 251 × 90 % = 225,9 → 226.
    expect(ProPriceRatio.create(9_000).applyTo(250)).toBe(225);
    expect(ProPriceRatio.create(9_000).applyTo(251)).toBe(226);
  });

  it("laisse un prix public nul à zéro", () => {
    expect(ProPriceRatio.create(9_000).applyTo(0)).toBe(0);
  });
});
