import { splitOrderByRate } from "../order-vat-split.js";
import { ventilateVat, type VatLine } from "../vat.js";

/**
 * La remise d'assiette RESTREINTE — celle d'un point de retrait dont des
 * catégories sont exclues (plan
 * `documentation/livraisons/clientele/plan-remise-retrait-par-clientele-et-exclusions.md`, §3, R1).
 */
const PAIN: VatLine = { htCents: 1000, vatRate: 5.5 };
const BOISSON_EXCLUE: VatLine = { htCents: 1000, vatRate: 20, discountEligible: false };

describe("ventilateVat — la remise restreinte", () => {
  /**
   * L'exemple du §3 : −10 % sur le pain à 5,5 %, la boisson à 20 % exclue.
   * Toute la remise vient de la base à 5,5 % ; la base à 20 % reste entière.
   * (1000 − 100) × 5,5 % = 49,5 → 50 ; 1000 × 20 % = 200.
   */
  it("ne retranche rien de la base d'une ligne exclue", () => {
    const result = ventilateVat({
      lines: [PAIN, BOISSON_EXCLUE],
      eligibleDiscountCents: 100,
      discountCents: 0,
      extras: [],
    });

    expect(result.vat).toEqual([
      { rate: 5.5, amountCents: 50 },
      { rate: 20, amountCents: 200 },
    ]);
    expect(result.discountCents).toBe(100);
    expect(result.totalCents).toBe(2000 - 100 + 250);
  });

  /** Régression du §3 : ventilée sur tout le panier, la base à 20 % aurait perdu 50. */
  it("ne donne pas la TVA d'une remise ventilée sur tout le panier", () => {
    const wrong = ventilateVat({
      lines: [PAIN, { ...BOISSON_EXCLUE }],
      discountCents: 100,
      extras: [],
    });
    const right = ventilateVat({
      lines: [PAIN, BOISSON_EXCLUE],
      eligibleDiscountCents: 100,
      discountCents: 0,
      extras: [],
    });

    expect(right.vatTotalCents).toBeGreaterThan(wrong.vatTotalCents);
  });

  it("est bornée au hors taxe des seules lignes éligibles", () => {
    const result = ventilateVat({
      lines: [PAIN, BOISSON_EXCLUE],
      eligibleDiscountCents: 5000,
      discountCents: 0,
      extras: [],
    });

    expect(result.discountCents).toBe(1000);
    expect(result.vat).toEqual([{ rate: 20, amountCents: 200 }]);
  });

  it("reste sans effet quand aucune ligne n'est éligible", () => {
    const result = ventilateVat({
      lines: [BOISSON_EXCLUE],
      eligibleDiscountCents: 100,
      discountCents: 0,
      extras: [],
    });

    expect(result.discountCents).toBe(0);
    expect(result.totalCents).toBe(1200);
  });

  /**
   * Le bon porte sur TOUTES les lignes, après la remise du point : 900 + 1000
   * restent, le bon de 190 en retire 10 % à chacune. 810 × 5,5 % = 44,55 → 45 ;
   * 900 × 20 % = 180.
   */
  it("laisse le bon se ventiler sur toutes les lignes, après elle", () => {
    const result = ventilateVat({
      lines: [PAIN, BOISSON_EXCLUE],
      eligibleDiscountCents: 100,
      discountCents: 190,
      extras: [],
    });

    expect(result.vat).toEqual([
      { rate: 5.5, amountCents: 45 },
      { rate: 20, amountCents: 180 },
    ]);
    expect(result.discountCents).toBe(290);
  });

  it("rend le calcul d'hier quand toutes les lignes sont éligibles", () => {
    const lines: readonly VatLine[] = [PAIN, { htCents: 1000, vatRate: 20 }];
    const restricted = ventilateVat({
      lines,
      eligibleDiscountCents: 200,
      discountCents: 0,
      extras: [],
    });
    const global = ventilateVat({ lines, discountCents: 200, extras: [] });

    expect(restricted).toEqual(global);
  });
});

describe("splitOrderByRate — une remise à assiette restreinte", () => {
  it("se découpe sur ses seules lignes éligibles", () => {
    const split = splitOrderByRate({
      lines: [PAIN, BOISSON_EXCLUE],
      eligibleDiscountCents: 100,
      discountCents: 0,
      extras: [],
    });

    expect(split.eligibleDiscount).toEqual([{ vatRate: 5.5, amountCents: 100 }]);
  });

  it("sans ligne éligible, la remise ne s'applique pas — comme au bon", () => {
    const split = splitOrderByRate({
      lines: [BOISSON_EXCLUE],
      eligibleDiscountCents: 100,
      discountCents: 0,
      extras: [],
    });

    expect(split.eligibleDiscount).toEqual([]);
  });
});
