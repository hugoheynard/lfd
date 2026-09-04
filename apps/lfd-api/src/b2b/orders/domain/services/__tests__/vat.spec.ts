import { computeVatCents, MissingLateFeeVatRateError } from "../vat.js";

describe("computeVatCents", () => {
  it("applique 5,5 % sur des marchandises alimentaires", () => {
    // 1000 HT × 5,5 % = 55.
    const vat = computeVatCents({
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
    const vat = computeVatCents({
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
    const vat = computeVatCents({
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
    const vat = computeVatCents({
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
    const vat = computeVatCents({
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
    const vat = computeVatCents({
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
    const vat = computeVatCents({
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
      computeVatCents({
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
      computeVatCents({
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
    const vat = computeVatCents({
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
