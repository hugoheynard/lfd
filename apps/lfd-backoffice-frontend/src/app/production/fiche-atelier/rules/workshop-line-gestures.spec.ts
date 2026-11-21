import type { WorkshopLine } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { lineGestures } from './workshop-line-gestures';

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
