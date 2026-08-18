import { describe, expect, it } from 'vitest';

import {
  averageUnitCents,
  curveOf,
  fixedScenario,
  gapCents,
  revenueCentsAt,
  unitPriceCentsAt,
  volumeSamples,
  type ArticleBasis,
  type Scenario,
} from '../revenue-model';

const basis: ArticleBasis = { catalogCents: 100, floorCents: null };

const ladder: Scenario = {
  id: 'paliers',
  label: 'Paliers',
  tiers: [
    { minQuantity: 1, unitPriceCents: 90 },
    { minQuantity: 100, unitPriceCents: 80 },
    { minQuantity: 500, unitPriceCents: 70 },
  ],
};

describe('unitPriceCentsAt', () => {
  it('prend le plus haut palier atteint', () => {
    expect(unitPriceCentsAt(ladder, basis, 1)).toBe(90);
    expect(unitPriceCentsAt(ladder, basis, 99)).toBe(90);
    expect(unitPriceCentsAt(ladder, basis, 100)).toBe(80);
    expect(unitPriceCentsAt(ladder, basis, 10_000)).toBe(70);
  });

  it('facture le CATALOGUE sous le premier seuil, pas le premier palier', () => {
    const late: Scenario = {
      id: 'tardif',
      label: 'Tardif',
      tiers: [{ minQuantity: 500, unitPriceCents: 70 }],
    };
    expect(unitPriceCentsAt(late, basis, 499)).toBe(100);
    expect(unitPriceCentsAt(late, basis, 500)).toBe(70);
  });

  it('la limite relève le palier, comme à la caisse', () => {
    const floored: ArticleBasis = { catalogCents: 100, floorCents: 85 };
    expect(unitPriceCentsAt(ladder, floored, 10_000)).toBe(85);
  });
});

describe('revenueCentsAt', () => {
  it('somme unité par unité : le passé ne se refacture pas', () => {
    // 99 × 0,90 puis 1 × 0,80 — et NON 100 × 0,80.
    expect(revenueCentsAt(ladder, basis, 100)).toBe(99 * 90 + 80);
  });

  it('croît toujours : commander plus ne peut pas rapporter moins', () => {
    let previous = 0;
    for (let volume = 1; volume <= 600; volume += 1) {
      const revenue = revenueCentsAt(ladder, basis, volume);
      expect(revenue).toBeGreaterThan(previous);
      previous = revenue;
    }
  });

  it('un prix fixe donne une droite', () => {
    const fixed: Scenario = {
      id: 'fixe',
      label: 'Fixe',
      tiers: [{ minQuantity: 1, unitPriceCents: 75 }],
    };
    expect(revenueCentsAt(fixed, basis, 1_000)).toBe(75_000);
  });
});

describe('fixedScenario', () => {
  const target = 500;
  const headlineCents = unitPriceCentsAt(ladder, basis, target);
  const averageCents = averageUnitCents(ladder, basis, target) ?? 0;

  it('au PRIX ANNONCÉ, le barème rapporte plus — partout, sans croisement', () => {
    const fixed = fixedScenario(headlineCents, basis);
    for (const volume of [10, 200, target, 900]) {
      expect(revenueCentsAt(ladder, basis, volume)).toBeGreaterThan(
        revenueCentsAt(fixed, basis, volume),
      );
    }
  });

  it('au PRIX MOYEN, les deux pèsent le même total au volume promis', () => {
    const fixed = fixedScenario(averageCents, basis);
    const spread = revenueCentsAt(ladder, basis, target) - revenueCentsAt(fixed, basis, target);
    // À l'arrondi du centime près, et pas davantage.
    expect(Math.abs(spread)).toBeLessThanOrEqual(target);
  });

  it("et là seulement, l'écart change de signe de part et d'autre", () => {
    const fixed = fixedScenario(averageCents, basis);
    expect(revenueCentsAt(ladder, basis, 200)).toBeGreaterThan(revenueCentsAt(fixed, basis, 200));
    expect(revenueCentsAt(ladder, basis, 900)).toBeLessThan(revenueCentsAt(fixed, basis, 900));
  });

  it('un prix fixe librement choisi peut passer sous le barème partout', () => {
    // Le cas qui motive la saisie libre : « et si je lui avais fait 0,60 € ? ».
    const fixed = fixedScenario(60, basis);
    expect(revenueCentsAt(fixed, basis, target)).toBeLessThan(
      revenueCentsAt(ladder, basis, target),
    );
  });

  it('la limite relève un prix fixe trop bas, comme à la caisse', () => {
    const floored = fixedScenario(60, { catalogCents: 100, floorCents: 85 });
    expect(floored.tiers[0]?.unitPriceCents).toBe(85);
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

describe('gapCents', () => {
  it("s'annule au volume promis, et pas ailleurs", () => {
    const target = 500;
    const fixed = fixedScenario(averageUnitCents(ladder, basis, target) ?? 0, basis);
    const volumes = [200, target];
    const gap = gapCents(curveOf(ladder, basis, volumes), curveOf(fixed, basis, volumes));
    expect(Math.abs(gap[1]?.revenueCents ?? 0)).toBeLessThanOrEqual(target);
    expect(gap[0]?.revenueCents).toBeGreaterThan(0);
  });
});

describe('averageUnitCents', () => {
  it("dit ce que le client a payé en moyenne, pas le prix d'affiche", () => {
    expect(averageUnitCents(ladder, basis, 100)).toBe(Math.round((99 * 90 + 80) / 100));
  });
});
