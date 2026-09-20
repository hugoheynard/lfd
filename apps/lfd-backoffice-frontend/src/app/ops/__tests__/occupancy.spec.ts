import { describe, expect, it } from 'vitest';
import type { TrafficWindow } from '@lfd/ops-contract';

import { occupancyOf, P95_CALM_MS, P95_SATURATED_MS } from '../occupancy';

/**
 * L'occupation décide de la couleur des liens. Chaque test ci-dessous verrouille
 * une façon de rendre cette couleur inutile — et une couleur inutile est pire
 * qu'absente : elle s'apprend, puis s'ignore.
 */

const window = (over: Partial<TrafficWindow> = {}): TrafficWindow => ({
  node: 'b2b',
  from: '2026-08-19T11:55:00.000Z',
  to: '2026-08-19T12:00:00.000Z',
  requests: 1000,
  serverErrors: 0,
  throttled: 0,
  gatewayFaults: 0,
  p95Ms: P95_CALM_MS,
  ...over,
});

describe('occupancyOf', () => {
  it('ne monte PAS avec le volume', () => {
    // Le cœur de la règle : un trait qui rougit parce que le trafic monte alors
    // que tout va bien apprend à ignorer la couleur. Cent ou cent mille
    // requêtes, à latence égale, c'est la même occupation.
    const petit = occupancyOf(window({ requests: 100 }));
    const enorme = occupancyOf(window({ requests: 100_000 }));

    expect(enorme.ratio).toBe(petit.ratio);
  });

  it('monte avec la latence, entre le seuil calme et la saturation', () => {
    const milieu = (P95_CALM_MS + P95_SATURATED_MS) / 2;

    expect(occupancyOf(window({ p95Ms: P95_CALM_MS })).ratio).toBe(0);
    expect(occupancyOf(window({ p95Ms: milieu })).ratio).toBeCloseTo(0.5);
    expect(occupancyOf(window({ p95Ms: P95_SATURATED_MS })).ratio).toBe(1);
  });

  it('ne dépasse jamais 1, même très au-delà du plafond', () => {
    // Une jauge hors bornes ne se lit plus, et casserait l'échelle des tons.
    expect(occupancyOf(window({ p95Ms: 60_000 })).ratio).toBe(1);
  });

  it('lit un rejet comme une occupation, pas comme une panne', () => {
    // Un nœud qui rejette est PAR DÉFINITION à son plafond déclaré. C'est de la
    // charge, pas de la maladie — le statut, lui, reste vert.
    const occupancy = occupancyOf(window({ throttled: 900 }));

    expect(occupancy.tone).toBe('saturated');
    expect(occupancy.basis).toBe('rejets');
  });

  it('retient le pire des deux plafonds, sans les moyenner', () => {
    // Moyenner diluerait un rejet massif dans une latence honnête — et c'est
    // exactement le cas où il faut regarder.
    const occupancy = occupancyOf(window({ p95Ms: P95_CALM_MS, throttled: 800 }));

    expect(occupancy.ratio).toBeCloseTo(0.8);
  });

  it("avoue quand il n'a rien mesuré", () => {
    // Un lien gris qui dit « je ne sais pas » vaut mieux qu'un lien vert qui dit
    // « tout va bien » sans rien avoir mesuré.
    expect(occupancyOf(undefined).basis).toBe('aucune mesure');
    expect(occupancyOf(window({ requests: 0 })).basis).toBe('aucune mesure');
  });
});
