import { describe, expect, it } from 'vitest';

import { averageUnderRegime, revenueUnderRegime } from '../pricing-regime';
import { unitPriceCentsAt, type ArticleBasis, type Scenario } from '../revenue-model';

const basis: ArticleBasis = { catalogCents: 200, floorMillicents: null };

/** 200 au catalogue, 180 dès 1, 150 dès 1 000, 120 dès 10 000. */
const ladder: Scenario = {
  id: 'paliers',
  label: 'Paliers',
  tiers: [
    { minQuantity: 1, unitPriceMillicents: 180 },
    { minQuantity: 1_000, unitPriceMillicents: 150 },
    { minQuantity: 10_000, unitPriceMillicents: 120 },
  ],
};

describe('revenueUnderRegime · sans engagement', () => {
  /**
   * Le piège que ce régime rend visible : le client qui étale sa saison
   * n'atteint que le palier de sa commande type. 10 000 baguettes en commandes
   * de 200 se paient au prix d'entrée, pas au prix négocié.
   */
  it('facture tout au palier de la commande type', () => {
    const spread = revenueUnderRegime(ladder, basis, 10_000, { kind: 'perOrder', orderSize: 200 });
    expect(spread).toBe(10_000 * 180);
  });

  it('récompense la grosse commande, et elle seule', () => {
    const bulk = revenueUnderRegime(ladder, basis, 10_000, { kind: 'perOrder', orderSize: 10_000 });
    expect(bulk).toBe(10_000 * 120);
  });
});

describe('revenueUnderRegime · engagement signé', () => {
  const commitment = { kind: 'commitment', promised: 10_000 } as const;

  /** La story : le prix annoncé est là dès la première pièce. */
  it('facture au palier ANNONCÉ dès la première commande', () => {
    expect(revenueUnderRegime(ladder, basis, 100, commitment)).toBe(100 * 120);
  });

  /**
   * **Le résultat qui règle la question d'origine.** Sous engagement, une grille
   * à paliers et un prix fixe au palier promis rapportent EXACTEMENT la même
   * chose sur toute la trajectoire — les paliers ne servent plus à rien.
   */
  it('est indistinguable du prix fixe au palier promis, jusqu’à la promesse', () => {
    const fixed: Scenario = {
      id: 'fixe',
      label: 'Fixe',
      tiers: [{ minQuantity: 1, unitPriceMillicents: unitPriceCentsAt(ladder, basis, 10_000) }],
    };
    for (const volume of [1, 2_500, 9_999, 10_000]) {
      expect(revenueUnderRegime(ladder, basis, volume, commitment)).toBe(
        revenueUnderRegime(fixed, basis, volume, commitment),
      );
    }
  });

  it('laisse le cumul reprendre la main au-delà de la promesse', () => {
    // Le palier le plus bas est déjà atteint : au-delà, chaque unité y reste.
    expect(revenueUnderRegime(ladder, basis, 12_000, commitment)).toBe(12_000 * 120);
  });

  it('croît toujours autour de la promesse', () => {
    let previous = 0;
    for (let volume = 1; volume <= 12_000; volume += 137) {
      const revenue = revenueUnderRegime(ladder, basis, volume, commitment);
      expect(revenue).toBeGreaterThan(previous);
      previous = revenue;
    }
  });
});

describe('revenueUnderRegime · cumul livré', () => {
  it('facture chaque unité au palier atteint à cet instant', () => {
    const delivered = revenueUnderRegime(ladder, basis, 1_000, { kind: 'delivered' });
    expect(delivered).toBe(999 * 180 + 150);
  });

  /** C'est LUI qui protège d'une sortie anticipée, et pas l'engagement. */
  it('encaisse plus que l’engagement sous la promesse', () => {
    const volume = 5_000;
    expect(revenueUnderRegime(ladder, basis, volume, { kind: 'delivered' })).toBeGreaterThan(
      revenueUnderRegime(ladder, basis, volume, { kind: 'commitment', promised: 10_000 }),
    );
  });
});

describe('averageUnderRegime', () => {
  it('rend le prix moyen du régime, pas celui de la grille', () => {
    expect(averageUnderRegime(ladder, basis, 100, { kind: 'commitment', promised: 10_000 })).toBe(
      120,
    );
    expect(averageUnderRegime(ladder, basis, 100, { kind: 'perOrder', orderSize: 100 })).toBe(180);
  });

  it('ne divise pas par zéro', () => {
    expect(averageUnderRegime(ladder, basis, 0, { kind: 'delivered' })).toBeNull();
  });
});
