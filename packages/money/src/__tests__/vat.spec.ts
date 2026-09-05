import { DELIVERY_VAT_RATE, ventilateVat, type VatLine } from "../vat.js";

const CROISSANT: VatLine = { htCents: 1000, vatRate: 5.5 };
const QUICHE: VatLine = { htCents: 1000, vatRate: 10 };

/** Un panier sans remise ni frais — le cas de presque toutes les commandes. */
function plain(lines: readonly VatLine[]) {
  return ventilateVat({ lines, discountCents: 0, extras: [] });
}

describe("ventilateVat", () => {
  it("applique le taux au hors taxe", () => {
    // 1000 HT × 5,5 % = 55.
    expect(plain([CROISSANT]).vat).toEqual([{ rate: 5.5, amountCents: 55 }]);
  });

  it("rend le TTC : hors taxe + TVA", () => {
    expect(plain([CROISSANT]).totalCents).toBe(1055);
  });

  it("range les taux du plus bas au plus haut", () => {
    const rates = plain([QUICHE, CROISSANT]).vat.map((share) => share.rate);

    expect(rates).toEqual([5.5, 10]);
  });

  /**
   * 🔴 **Un seul arrondi par taux**, sur l'assiette totale du taux — pas un
   * arrondi par article. Trois lignes à 333 HT font 999, dont 5,5 % valent
   * 54,945 → 55. Arrondir chaque ligne (18,315 → 18) en rendrait 54.
   */
  it("arrondit une fois par taux, pas une fois par ligne", () => {
    const three: VatLine = { htCents: 333, vatRate: 5.5 };

    expect(plain([three, three, three]).vat).toEqual([{ rate: 5.5, amountCents: 55 }]);
  });

  it("regroupe les lignes d'un même taux en une seule part", () => {
    expect(plain([CROISSANT, CROISSANT]).vat).toEqual([{ rate: 5.5, amountCents: 110 }]);
  });

  /**
   * Une part nulle ne sort pas : « TVA 10 % — 0,00 € » fait douter du calcul au
   * lieu de rassurer. Le total, lui, est le même.
   */
  it("ne rend pas une part nulle", () => {
    const empty = plain([{ htCents: 0, vatRate: 10 }]);

    expect(empty.vat).toEqual([]);
    expect(empty.totalCents).toBe(0);
  });

  it("ne rend rien sur un panier vide", () => {
    expect(plain([])).toMatchObject({ subtotalHtCents: 0, vat: [], totalCents: 0 });
  });
});

describe("la remise", () => {
  it("réduit l'assiette taxable, pas seulement le total", () => {
    // (400 − 80) × 5,5 % = 17,6 → 18.
    const discounted = ventilateVat({
      lines: [{ htCents: 400, vatRate: 5.5 }],
      discountCents: 80,
      extras: [],
    });

    expect(discounted.vat).toEqual([{ rate: 5.5, amountCents: 18 }]);
    expect(discounted.totalCents).toBe(400 - 80 + 18);
  });

  /**
   * Elle se répartit **au prorata du poids hors taxe** de chaque taux. Sur un
   * panier moitié-moitié, chaque groupe en porte la moitié — l'imputer
   * entièrement au taux le plus bas ferait payer plus de TVA pour la même
   * remise.
   */
  it("se répartit au prorata du poids de chaque taux", () => {
    const mixed = ventilateVat({
      lines: [CROISSANT, QUICHE],
      discountCents: 200,
      extras: [],
    });

    // 900 × 5,5 % = 49,5 → 50 ; 900 × 10 % = 90.
    expect(mixed.vat).toEqual([
      { rate: 5.5, amountCents: 50 },
      { rate: 10, amountCents: 90 },
    ]);
  });

  /**
   * 🔴 Une remise plus grande que la marchandise ne rend pas une TVA négative.
   * Un avoir est un document, pas un panier qui déborde.
   */
  it("est bornée au sous-total", () => {
    const over = ventilateVat({ lines: [CROISSANT], discountCents: 5000, extras: [] });

    expect(over.discountCents).toBe(1000);
    expect(over.vat).toEqual([]);
    expect(over.totalCents).toBe(0);
  });
});

describe("les termes hors remise", () => {
  it("taxe le coursier à son taux", () => {
    const delivered = ventilateVat({
      lines: [CROISSANT],
      discountCents: 0,
      extras: [{ htCents: 2000, vatRate: DELIVERY_VAT_RATE }],
    });

    expect(delivered.vat).toEqual([
      { rate: 5.5, amountCents: 55 },
      { rate: 20, amountCents: 400 },
    ]);
    expect(delivered.totalCents).toBe(1000 + 2000 + 455);
  });

  /**
   * 🔴 **Le coursier fait exister la ligne à 20 %**, même quand le panier ne
   * contient que du pain. C'est contre-intuitif et c'est correct : une
   * prestation de transport est au taux normal.
   */
  it("fait apparaître un taux qu'aucune marchandise ne porte", () => {
    const delivered = ventilateVat({
      lines: [CROISSANT],
      discountCents: 0,
      extras: [{ htCents: 1000, vatRate: DELIVERY_VAT_RATE }],
    });

    expect(delivered.vat.map((share) => share.rate)).toEqual([5.5, 20]);
  });

  /** La remise ne les touche pas : on ne fait pas de geste sur une pénalité. */
  it("ne sont pas remisés", () => {
    const late = ventilateVat({
      lines: [CROISSANT],
      discountCents: 1000,
      extras: [{ htCents: 500, vatRate: 20 }],
    });

    // Marchandises entièrement remisées → 0 ; la surtaxe garde ses 100.
    expect(late.vat).toEqual([{ rate: 20, amountCents: 100 }]);
    expect(late.totalCents).toBe(600);
  });

  /**
   * Un extra REJOINT le groupe de son taux au lieu d'être arrondi à part.
   * 555 de marchandise + 555 de transport à 20 % font 1110 → 222 ; deux arrondis
   * séparés donneraient 111 + 111 = 222 ici, mais 55,5 → 56 deux fois ailleurs.
   */
  it("entre dans le groupe de son taux, pas dans une ligne à lui", () => {
    const merged = ventilateVat({
      lines: [{ htCents: 505, vatRate: 20 }],
      discountCents: 0,
      extras: [{ htCents: 505, vatRate: 20 }],
    });

    // 1010 × 20 % = 202, en UNE part.
    expect(merged.vat).toEqual([{ rate: 20, amountCents: 202 }]);
  });

  it("se taxe seul quand il n'y a aucune marchandise", () => {
    const only = ventilateVat({
      lines: [],
      discountCents: 0,
      extras: [{ htCents: 1000, vatRate: DELIVERY_VAT_RATE }],
    });

    expect(only.vat).toEqual([{ rate: 20, amountCents: 200 }]);
    expect(only.totalCents).toBe(1200);
  });
});

/**
 * Régression : `rate * 100` en binaire vaut `484.99999999999994` pour 4,85 —
 * un taux à deux décimales parfaitement légitime se serait décalé d'un point de
 * base, donc d'un centime sur les gros montants.
 */
describe("un taux à deux décimales", () => {
  it("ne dérive pas d'un point de base", () => {
    const odd = plain([{ htCents: 100_000, vatRate: 4.85 }]);

    expect(odd.vat).toEqual([{ rate: 4.85, amountCents: 4850 }]);
  });
});
