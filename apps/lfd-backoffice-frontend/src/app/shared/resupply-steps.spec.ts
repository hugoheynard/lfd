import { describe, expect, it } from 'vitest';

import { resupplySteps, type ResupplyTrack } from './resupply-steps';

/** R4d : les étapes atteintes, dans l'ordre, avec l'heure de Paris et l'auteur connu. */
const SENT: ResupplyTrack = {
  placedAt: '2026-01-03T06:00:00.000Z',
  placedBy: 'Lou',
  launchedAt: null,
  launchedBy: null,
  departedAt: null,
  departedBy: null,
  arrivedAt: null,
  arrivedBy: null,
};

describe('resupplySteps', () => {
  it('ne dit qu’« Envoyé » tant que rien d’autre n’est arrivé', () => {
    expect(resupplySteps(SENT)).toEqual([
      { key: 'sent', label: 'Envoyé', status: 'coming-soon', detail: '07:00 · Lou' },
    ]);
  });

  it('suit Envoyé → Lancé → Parti → Arrivé, sans auteur quand on ne l’a pas', () => {
    const steps = resupplySteps({
      ...SENT,
      launchedAt: '2026-01-03T06:05:00.000Z',
      launchedBy: 'Max',
      departedAt: '2026-01-03T07:30:00.000Z',
      departedBy: null,
      arrivedAt: '2026-01-03T08:00:00.000Z',
      arrivedBy: 'Paul',
    });

    expect(steps.map((step) => step.label)).toEqual(['Envoyé', 'Lancé', 'Parti', 'Arrivé']);
    expect(steps.map((step) => step.detail)).toEqual([
      '07:00 · Lou',
      '07:05 · Max',
      '08:30',
      '09:00 · Paul',
    ]);
  });

  it('saute une étape qui ne s’applique pas (Labo : pas de départ)', () => {
    const steps = resupplySteps({
      ...SENT,
      launchedAt: '2026-01-03T06:05:00.000Z',
      arrivedAt: '2026-01-03T08:00:00.000Z',
    });

    expect(steps.map((step) => step.key)).toEqual(['sent', 'launched', 'arrived']);
  });
});
