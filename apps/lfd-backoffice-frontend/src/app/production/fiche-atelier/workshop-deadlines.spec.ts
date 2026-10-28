import type { WorkshopLine } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  beforeLabel,
  currentStep,
  isLate,
  lateMinutes,
  slots,
  stepRemaining,
  steps,
} from './workshop-deadlines';

/** 7 h 56 — l'heure figée de la maquette. */
const NOW = 7 * 60 + 56;

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
    produced: 0,
    remaining: 240,
    surplus: 0,
    batches: [],
    container: { unitsPerContainer: 30, singular: 'plaque' },
    deadlines: [
      { quantity: 120, before: '07:00' },
      { quantity: 120, before: '09:30' },
    ],
    ...over,
  };
}

describe('les paliers d’une ligne', () => {
  it('cumule les paliers, et leur somme vaut la quantité de la ligne', () => {
    const all = steps(line());

    expect(all.map((step) => [step.from, step.to])).toEqual([
      [0, 120],
      [120, 240],
    ]);
    expect(all.reduce((sum, step) => sum + step.q, 0)).toBe(240);
  });

  it('donne la dérive au DERNIER palier', () => {
    const all = steps(line({ quantity: 252 }));

    expect(all.map((step) => step.q)).toEqual([120, 132]);
  });

  it('rogne un excédent en partant du dernier : la somme reste la quantité', () => {
    const all = steps(line({ quantity: 100 }));

    expect(all.map((step) => step.q)).toEqual([100]);
  });

  it('sans palier servi, un seul « dans la journée », sans heure inventée', () => {
    const all = steps(line({ deadlines: [] }));

    expect(all).toEqual([{ q: 240, before: null, from: 0, to: 240 }]);
    expect(beforeLabel(null)).toBe('dans la journée');
    expect(beforeLabel('07:00')).toBe('avant 7 h 00');
  });

  it('les fournées remplissent dans l’ordre : 130 sur 120 + 120 → palier 2 à 10 / 120', () => {
    const served = line({ produced: 130 });

    expect(currentStep(served, 130)?.before).toBe('09:30');
    expect(stepRemaining(served, 130)).toBe(110);
    const [, second] = slots([served], NOW).map((slot) => slot.rows[0]);
    expect(second?.got).toBe(10);
  });

  it('une ligne faite n’a plus de palier en cours', () => {
    expect(currentStep(line(), 240)).toBeNull();
    expect(stepRemaining(line(), 240)).toBe(0);
  });
});

describe('le retard', () => {
  it('est vrai quand le palier en cours a passé son heure', () => {
    const step = currentStep(line(), 60);

    expect(isLate(step, 60, NOW)).toBe(true);
    expect(lateMinutes(step, NOW)).toBe(56);
  });

  it('est FAUX si le palier est tenu, même après l’heure', () => {
    const [first] = steps(line());

    expect(isLate(first ?? null, 120, NOW)).toBe(false);
  });

  it('n’existe pas sans heure', () => {
    const [only] = steps(line({ deadlines: [] }));

    expect(isLate(only ?? null, 0, 23 * 60)).toBe(false);
  });
});

describe('la vue par tranche', () => {
  const lines = [
    line({ produced: 120 }),
    line({
      sku: 'BRI',
      productName: 'Brioche',
      quantity: 42,
      produced: 0,
      deadlines: [
        { quantity: 24, before: '08:15' },
        { quantity: 18, before: '09:30' },
      ],
    }),
    line({
      sku: 'ECL',
      productName: 'Éclair',
      quantity: 15,
      produced: 0,
      deadlines: [{ quantity: 15, before: '07:45' }],
    }),
  ];

  it('range une carte par heure limite, dans l’ordre chronologique', () => {
    expect(slots(lines, NOW).map((slot) => slot.before)).toEqual([
      '07:00',
      '07:45',
      '08:15',
      '09:30',
    ]);
  });

  it('n’a qu’UNE « La prochaine », la première non tenue et non dépassée', () => {
    const states = slots(lines, NOW).map((slot) => slot.state);

    expect(states).toEqual(['met', 'over', 'next', 'upcoming']);
    expect(states.filter((state) => state === 'next')).toHaveLength(1);
  });

  it('« Tenue » n’est jamais « Dépassée », même longtemps après l’heure', () => {
    const [first] = slots(lines, 23 * 60);

    expect(first?.state).toBe('met');
    expect(first?.lateBy).toBe(0);
  });

  it('dit le dépassement en minutes', () => {
    expect(slots(lines, NOW)[1]?.lateBy).toBe(11);
  });

  it('dans une tranche non tenue, les produits tenus passent en bas', () => {
    const mixed = [
      line({ produced: 240, deadlines: [{ quantity: 240, before: '09:30' }] }),
      line({
        sku: 'PCH',
        productName: 'Pain au chocolat',
        quantity: 54,
        produced: 0,
        deadlines: [{ quantity: 54, before: '09:30' }],
      }),
    ];

    const [slot] = slots(mixed, NOW);

    expect(slot?.rows.map((row) => row.line.sku)).toEqual(['PCH', 'CRO']);
    expect(slot?.missing).toBe(54);
    expect(slot?.total).toBe(294);
  });
});
