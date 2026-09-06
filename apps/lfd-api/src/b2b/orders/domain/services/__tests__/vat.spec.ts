import { computeOrderTotals, MissingLateFeeVatRateError, type VatInput } from "../vat.js";

/**
 * La TVA seule — ce que `computeVatCents` rendait avant que la fonction ne
 * rende aussi le total. Les cas ci-dessous n'ont pas changé de substance : ils
 * éprouvent toujours la ventilation, et le total a son propre bloc plus bas.
 */
function vatOf(input: VatInput): number {
  return computeOrderTotals(input).vatCents;
}

describe("la TVA des marchandises et des termes de panier", () => {
  it("applique 5,5 % sur des marchandises alimentaires", () => {
    // 1000 HT × 5,5 % = 55.
    const vat = vatOf({
      // 5,5 % : le taux d'un article alimentaire, tel que le PIM le résout.
      lines: [{ htCents: 1000, vatRate: 5.5 }],
      discountCents: 0,
      deliveryFeeCents: 0,
      lateFeeCents: 0,
      lateFeeVatRate: null,
    });
    expect(vat).toBe(55);
  });

  it("déduit la remise au prorata avant d'appliquer le taux", () => {
    // (400 − 80) × 5,5 % = 320 × 0,055 = 17,6 → 18.
    const vat = vatOf({
      lines: [{ htCents: 400, vatRate: 5.5 }],
      discountCents: 80,
      deliveryFeeCents: 0,
      lateFeeCents: 0,
      lateFeeVatRate: null,
    });
    expect(vat).toBe(18);
  });

  it("ajoute la TVA de livraison à 20 %", () => {
    // marchandises 1000 × 5,5 % = 55 ; livraison 2000 × 20 % = 400 ; total 455.
    const vat = vatOf({
      lines: [{ htCents: 1000, vatRate: 5.5 }],
      discountCents: 0,
      deliveryFeeCents: 2000,
      lateFeeCents: 0,
      lateFeeVatRate: null,
    });
    expect(vat).toBe(455);
  });

  it("regroupe par taux et arrondit par groupe", () => {
    // 500 × 5,5 % = 27,5 → 28 ; 300 × 20 % = 60 ; total 88.
    const vat = vatOf({
      lines: [
        { htCents: 500, vatRate: 5.5 },
        { htCents: 300, vatRate: 20 },
      ],
      discountCents: 0,
      deliveryFeeCents: 0,
      lateFeeCents: 0,
      lateFeeVatRate: null,
    });
    expect(vat).toBe(88);
  });

  it("ne calcule que la TVA de livraison quand il n'y a pas de marchandise", () => {
    const vat = vatOf({
      lines: [],
      discountCents: 0,
      deliveryFeeCents: 1000,
      lateFeeCents: 0,
      lateFeeVatRate: null,
    });
    expect(vat).toBe(200);
  });
});

describe("la surtaxe de commande tardive", () => {
  const CROISSANT = { htCents: 1000, vatRate: 5.5 };

  /**
   * Elle porte SON taux, réglé, et pas celui des marchandises ni celui du
   * transport. Personne ne sait encore lequel des deux la loi retient ; le
   * choix est donc une donnée, jamais une constante.
   */
  it("taxe la surtaxe à son propre taux", () => {
    const vat = vatOf({
      lines: [CROISSANT],
      discountCents: 0,
      deliveryFeeCents: 0,
      lateFeeCents: 500,
      lateFeeVatRate: 20,
    });
    // 1000 × 5,5 % = 55 ; 500 × 20 % = 100.
    expect(vat).toBe(155);
  });

  it("suit le taux réglé, quel qu'il soit", () => {
    const vat = vatOf({
      lines: [],
      discountCents: 0,
      deliveryFeeCents: 0,
      lateFeeCents: 1000,
      lateFeeVatRate: 5.5,
    });
    expect(vat).toBe(55);
  });

  /**
   * 🔴 **Une surtaxe sans taux ne se facture pas.**
   *
   * Le repli tentant — 20 %, ou le taux des marchandises — facturerait un
   * montant que personne n'a décidé, sur toutes les commandes tardives et
   * rétroactivement. Une erreur bruyante coûte une commande ; un taux inventé se
   * rattrape à la main, ligne par ligne, et seulement si quelqu'un s'en aperçoit.
   */
  it("REFUSE de calculer quand le taux manque", () => {
    expect(() =>
      vatOf({
        lines: [CROISSANT],
        discountCents: 0,
        deliveryFeeCents: 0,
        lateFeeCents: 500,
        lateFeeVatRate: null,
      }),
    ).toThrow(MissingLateFeeVatRateError);
  });

  /** Pas de surtaxe, pas de taux à exiger : le cas de presque toutes les commandes. */
  it("ne réclame aucun taux quand il n'y a pas de surtaxe", () => {
    expect(() =>
      vatOf({
        lines: [CROISSANT],
        discountCents: 0,
        deliveryFeeCents: 0,
        lateFeeCents: 0,
        lateFeeVatRate: null,
      }),
    ).not.toThrow();
  });

  /**
   * La surtaxe n'entre PAS dans l'assiette de la remise : on ne fait pas de
   * geste commercial sur une pénalité de retard.
   */
  it("n'est pas remisée par la remise de retrait", () => {
    const vat = vatOf({
      lines: [CROISSANT],
      discountCents: 1000,
      deliveryFeeCents: 0,
      lateFeeCents: 500,
      lateFeeVatRate: 20,
    });
    // Marchandises entièrement remisées → 0 ; la surtaxe garde ses 100.
    expect(vat).toBe(100);
  });
});

/**
 * 🔴 **Le TTC, et le fait qu'il n'y ait qu'une définition de lui.**
 *
 * `Order.draft` le recomposait à la main pendant que la TVA venait de la
 * ventilation. Les deux tombaient juste, ce qui est exactement ce qui rendait la
 * chose dangereuse : rien ne les comparait. Ces cas-ci le comparent.
 */
describe("le total TTC de la commande", () => {
  it("somme le net de marchandises, les termes hors remise, et la TVA", () => {
    // 1000 − 100 = 900 net ; + 200 de course ; TVA = 900 × 5,5 % (50) + 200 × 20 % (40).
    const totals = computeOrderTotals({
      lines: [{ htCents: 1000, vatRate: 5.5 }],
      discountCents: 100,
      deliveryFeeCents: 200,
      lateFeeCents: 0,
      lateFeeVatRate: null,
    });

    expect(totals.vatCents).toBe(90);
    expect(totals.totalCents).toBe(900 + 200 + 90);
  });

  /**
   * La surtaxe entre dans le total comme les frais de zone — après la remise,
   * jamais dedans. C'était un commentaire dans `Order.draft` ; c'est désormais
   * une propriété de la ventilation, donc un test.
   */
  it("ajoute la surtaxe sans la remiser", () => {
    const totals = computeOrderTotals({
      lines: [{ htCents: 1000, vatRate: 5.5 }],
      discountCents: 1000,
      deliveryFeeCents: 0,
      lateFeeCents: 500,
      lateFeeVatRate: 20,
    });

    // Marchandises entièrement remisées → net 0. La surtaxe garde ses 500 HT et
    // ses 100 de TVA : le total est 600, pas 0.
    expect(totals.totalCents).toBe(600);
  });

  /**
   * La remise est bornée au sous-total **dans la ventilation aussi** : au-delà,
   * elle rendrait un total négatif, c'est-à-dire un avoir déguisé en commande.
   */
  it("ne rend jamais un total négatif, même sur une remise démesurée", () => {
    const totals = computeOrderTotals({
      lines: [{ htCents: 1000, vatRate: 5.5 }],
      discountCents: 5000,
      deliveryFeeCents: 0,
      lateFeeCents: 0,
      lateFeeVatRate: null,
    });

    expect(totals.totalCents).toBe(0);
  });
});
