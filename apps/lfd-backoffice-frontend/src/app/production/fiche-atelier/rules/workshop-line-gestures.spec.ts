import type { WorkshopLine } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { lineGestures, stepsWaitingLabel } from './workshop-line-gestures';

function line(over: Partial<WorkshopLine> = {}): WorkshopLine {
  return {
    sku: 'CRO',
    productName: 'Croissant au beurre',
    quantity: 240,
    saleUnit: 'piece',
    containerLabel: null,
    done: false,
    initials: null,
    doneAt: null,
    produced: 130,
    remaining: 110,
    surplus: 0,
    batches: [],
    container: { unitsPerContainer: 30, singular: 'plaque' },
    deadlines: [],
    ...over,
  };
}

const flags = (value: WorkshopLine) => {
  const { count, check, report } = lineGestures(value);
  return { count, check, report };
};

describe('les gestes d’une ligne selon son niveau', () => {
  it('détaillé : on compte, rien d’autre', () => {
    expect(flags(line({ trackingLevel: 'detailed' }))).toEqual({
      count: true,
      check: false,
      report: false,
    });
  });

  it('sans niveau servi, la ligne se lit en détaillé', () => {
    expect(lineGestures(line()).level).toBe('detailed');
  });

  it('simple : on coche et on signale, on ne compte pas', () => {
    expect(flags(line({ trackingLevel: 'simple' }))).toEqual({
      count: false,
      check: true,
      report: true,
    });
  });

  it('simple, déjà faite : plus de « Fait »', () => {
    expect(lineGestures(line({ trackingLevel: 'simple', done: true })).check).toBe(false);
  });

  it('simple, rien sous le plafond : plus de « Fait »', () => {
    expect(lineGestures(line({ trackingLevel: 'simple', remainingUnderCeiling: 0 })).check).toBe(
      false,
    );
  });

  it('toujours vert : on signale, rien d’autre', () => {
    expect(flags(line({ trackingLevel: 'always_green' }))).toEqual({
      count: false,
      check: false,
      report: true,
    });
  });
});

describe('une ligne d’étape (un produit sur plusieurs postes)', () => {
  it('n’a ni comptage, ni « Fait », ni « Problème », quel que soit son niveau', () => {
    for (const trackingLevel of ['detailed', 'simple', 'always_green'] as const) {
      expect(flags(line({ trackingLevel, role: 'step' }))).toEqual({
        count: false,
        check: false,
        report: false,
      });
    }
  });

  it('la ligne qui finit garde les gestes de son niveau', () => {
    expect(flags(line({ trackingLevel: 'simple', role: 'finishes' })).check).toBe(true);
  });

  it('nomme les postes d’étape qui n’ont pas coché, et se tait quand aucun n’attend', () => {
    const names = new Map([['ws_b', 'Boulangerie']]);
    expect(stepsWaitingLabel(line({ stepsPending: ['ws_b', 'ws_x'] }), names)).toBe(
      'En attente de : Boulangerie, un autre poste',
    );
    expect(stepsWaitingLabel(line({ stepsPending: [] }), names)).toBeNull();
    expect(stepsWaitingLabel(line(), names)).toBeNull();
  });
});
