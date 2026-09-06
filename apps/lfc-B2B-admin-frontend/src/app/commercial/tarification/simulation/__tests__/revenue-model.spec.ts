import { describe, expect, it } from 'vitest';

import {
  averageUnitMillicents,
  curveOf,
  fixedScenario,
  gapMillicents,
  revenueMillicentsAt,
  unitPriceMillicentsAt,
  volumeSamples,
  type ArticleBasis,
  type Scenario,
} from '../revenue-model';

const basis: ArticleBasis = { catalogMillicents: 100, floorMillicents: null };

const ladder: Scenario = {
  id: 'paliers',
  label: 'Paliers',
  tiers: [
    { minQuantity: 1, unitPriceMillicents: 90 },
    { minQuantity: 100, unitPriceMillicents: 80 },
    { minQuantity: 500, unitPriceMillicents: 70 },
  ],
};

describe('unitPriceMillicentsAt', () => {
  it('prend le plus haut palier atteint', () => {
    expect(unitPriceMillicentsAt(ladder, basis, 1)).toBe(90);
    expect(unitPriceMillicentsAt(ladder, basis, 99)).toBe(90);
    expect(unitPriceMillicentsAt(ladder, basis, 100)).toBe(80);
    expect(unitPriceMillicentsAt(ladder, basis, 10_000)).toBe(70);
  });

  it('facture le CATALOGUE sous le premier seuil, pas le premier palier', () => {
    const late: Scenario = {
      id: 'tardif',
      label: 'Tardif',
      tiers: [{ minQuantity: 500, unitPriceMillicents: 70 }],
    };
    expect(unitPriceMillicentsAt(late, basis, 499)).toBe(100);
    expect(unitPriceMillicentsAt(late, basis, 500)).toBe(70);
  });

  it('la limite relève le palier, comme à la caisse', () => {
    const floored: ArticleBasis = { catalogMillicents: 100, floorMillicents: 85 };
    expect(unitPriceMillicentsAt(ladder, floored, 10_000)).toBe(85);
  });
});

describe('revenueMillicentsAt', () => {
  it('somme unité par unité : le passé ne se refacture pas', () => {
    // 99 × 0,90 puis 1 × 0,80 — et NON 100 × 0,80.
    expect(revenueMillicentsAt(ladder, basis, 100)).toBe(99 * 90 + 80);
  });

  it('croît toujours : commander plus ne peut pas rapporter moins', () => {
    let previous = 0;
    for (let volume = 1; volume <= 600; volume += 1) {
      const revenue = revenueMillicentsAt(ladder, basis, volume);
      expect(revenue).toBeGreaterThan(previous);
      previous = revenue;
    }
  });

  it('un prix fixe donne une droite', () => {
    const fixed: Scenario = {
      id: 'fixe',
      label: 'Fixe',
      tiers: [{ minQuantity: 1, unitPriceMillicents: 75 }],
    };
    expect(revenueMillicentsAt(fixed, basis, 1_000)).toBe(75_000);
  });
});

describe('fixedScenario', () => {
  const target = 500;
  const headlineMillicents = unitPriceMillicentsAt(ladder, basis, target);
  const averageMillicents = averageUnitMillicents(ladder, basis, target) ?? 0;

  it('au PRIX ANNONCÉ, le barème rapporte plus — partout, sans croisement', () => {
    const fixed = fixedScenario(headlineMillicents, basis);
    for (const volume of [10, 200, target, 900]) {
      expect(revenueMillicentsAt(ladder, basis, volume)).toBeGreaterThan(
        revenueMillicentsAt(fixed, basis, volume),
      );
    }
  });

  it('au PRIX MOYEN, les deux pèsent le même total au volume promis', () => {
    const fixed = fixedScenario(averageMillicents, basis);
    const spread =
      revenueMillicentsAt(ladder, basis, target) - revenueMillicentsAt(fixed, basis, target);
    // À l'arrondi du centime près, et pas davantage.
    expect(Math.abs(spread)).toBeLessThanOrEqual(target);
  });

  it("et là seulement, l'écart change de signe de part et d'autre", () => {
    const fixed = fixedScenario(averageMillicents, basis);
    expect(revenueMillicentsAt(ladder, basis, 200)).toBeGreaterThan(
      revenueMillicentsAt(fixed, basis, 200),
    );
    expect(revenueMillicentsAt(ladder, basis, 900)).toBeLessThan(
      revenueMillicentsAt(fixed, basis, 900),
    );
  });

  it('un prix fixe librement choisi peut passer sous le barème partout', () => {
    // Le cas qui motive la saisie libre : « et si je lui avais fait 0,60 € ? ».
    const fixed = fixedScenario(60, basis);
    expect(revenueMillicentsAt(fixed, basis, target)).toBeLessThan(
      revenueMillicentsAt(ladder, basis, target),
    );
  });

  it('la limite relève un prix fixe trop bas, comme à la caisse', () => {
    const floored = fixedScenario(60, { catalogMillicents: 100, floorMillicents: 85 });
    expect(floored.tiers[0]?.unitPriceMillicents).toBe(85);
  });
});

describe('volumeSamples', () => {
  it('échantillonne chaque seuil et son voisin immédiat', () => {
    const samples = volumeSamples([ladder], 500, 650);
    expect(samples).toContain(99);
    expect(samples).toContain(100);
    expect(samples).toContain(499);
    expect(samples).toContain(500);
  });

  it('reste bornée et triée', () => {
    const samples = volumeSamples([ladder], 500, 650);
    expect(samples[0]).toBe(1);
    expect(samples.at(-1)).toBe(650);
    expect([...samples].sort((left, right) => left - right)).toEqual([...samples]);
  });
});

describe('gapMillicents', () => {
  it("s'annule au volume promis, et pas ailleurs", () => {
    const target = 500;
    const fixed = fixedScenario(averageUnitMillicents(ladder, basis, target) ?? 0, basis);
    const volumes = [200, target];
    const gap = gapMillicents(curveOf(ladder, basis, volumes), curveOf(fixed, basis, volumes));
    expect(Math.abs(gap[1]?.revenueMillicents ?? 0)).toBeLessThanOrEqual(target);
    expect(gap[0]?.revenueMillicents).toBeGreaterThan(0);
  });
});

describe('averageUnitMillicents', () => {
  it("dit ce que le client a payé en moyenne, pas le prix d'affiche", () => {
    expect(averageUnitMillicents(ladder, basis, 100)).toBe(Math.round((99 * 90 + 80) / 100));
  });
});
