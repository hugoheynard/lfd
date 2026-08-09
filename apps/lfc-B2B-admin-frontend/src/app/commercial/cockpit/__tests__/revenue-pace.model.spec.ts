import { describe, expect, it } from 'vitest';
import type { OrderMetricsView } from '@lfd/contracts';

import { euros, revenuePace } from '../revenue-pace/revenue-pace.model';

/** Une vue minimale : seuls `days` et `caCents` comptent pour l'allure. */
function metrics(entries: readonly (readonly [string, number])[]): OrderMetricsView {
  return {
    days: entries.map(([day]) => day),
    caCents: entries.map(([, cents]) => cents),
    caGoodsCents: entries.map(([, cents]) => cents),
    orders: entries.map(() => 1),
    caRecurringCents: entries.map(() => 0),
    caOneShotCents: entries.map(([, cents]) => cents),
    concentration: { lorenz: [], gini: 0, topDecileShare: 0, accounts: 0, totalVolumeCents: 0 },
    computedAt: '2026-08-09T00:00:00.000Z',
  };
}

describe("l'allure du mois", () => {
  it('cumule le mois courant, jour après jour', () => {
    const pace = revenuePace(
      metrics([
        ['2026-08-01', 1_000],
        ['2026-08-02', 500],
        ['2026-08-03', 2_000],
      ]),
      new Date('2026-08-03T12:00:00'),
    );
    expect(pace.current.cumulative).toEqual([1_000, 1_500, 3_500]);
    expect(pace.current.total).toBe(3_500);
  });

  it('compare au mois précédent AU MÊME JOUR, pas à son total', () => {
    const pace = revenuePace(
      metrics([
        ['2026-07-01', 1_000],
        ['2026-07-02', 1_000],
        ['2026-07-03', 8_000], // après le 2 : ne doit PAS entrer dans la comparaison
        ['2026-08-01', 1_500],
        ['2026-08-02', 1_500],
      ]),
      new Date('2026-08-02T12:00:00'),
    );
    expect(pace.previousAtSameDay).toBe(2_000);
    expect(pace.percent).toBe(50);
    expect(pace.direction).toBe('up');
  });

  it('franchit janvier : le mois précédent est décembre de l’an d’avant', () => {
    const pace = revenuePace(
      metrics([
        ['2025-12-01', 4_000],
        ['2026-01-01', 1_000],
      ]),
      new Date('2026-01-01T12:00:00'),
    );
    expect(pace.previousAtSameDay).toBe(4_000);
    expect(pace.direction).toBe('down');
  });

  it('retombe sur le DERNIER jour connu quand le mois précédent est plus court', () => {
    // Le 31 mars n'a pas d'équivalent en février : comparer à zéro ferait croire
    // à un mois exceptionnel.
    const pace = revenuePace(
      metrics([
        ['2026-02-27', 1_000],
        ['2026-02-28', 1_000],
        ['2026-03-31', 3_000],
      ]),
      new Date('2026-03-31T12:00:00'),
    );
    expect(pace.previousAtSameDay).toBe(2_000);
  });

  it('ne calcule AUCUN pourcentage quand le mois précédent était à zéro', () => {
    // Une hausse « infinie » n'est pas une information : la direction suffit.
    const pace = revenuePace(metrics([['2026-08-01', 1_000]]), new Date('2026-08-01T12:00:00'));
    expect(pace.previousAtSameDay).toBe(0);
    expect(pace.percent).toBeNull();
    expect(pace.direction).toBe('up');
  });

  it('trace sur le plus long des deux mois', () => {
    const pace = revenuePace(
      metrics([
        ['2026-07-01', 1],
        ['2026-07-02', 1],
        ['2026-07-03', 1],
        ['2026-08-01', 1],
      ]),
      new Date('2026-08-01T12:00:00'),
    );
    expect(pace.length).toBe(3);
  });
});

describe("l'affichage d'un montant", () => {
  it("arrondit à l'euro — on lit une allure, pas une facture", () => {
    // Les espaces sont normalisés : `toLocaleString` sépare les milliers par une
    // espace insécable étroite (U+202F), dépendante de la version d'ICU. Ce qu'on
    // teste ici, c'est l'arrondi et l'unité — pas le caractère d'espacement.
    const flatten = (value: string): string => value.replace(/\s/gu, ' ');
    expect(flatten(euros(1_234_567))).toBe('12 346 €');
    expect(flatten(euros(49))).toBe('0 €');
  });
});
