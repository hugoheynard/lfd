import { describe, expect, it } from 'vitest';

import type { MonthlyClosureView } from '@lfd/contracts';

import { closuresInOrder } from './closures-in-order';

function closure(periodClosesAt: string): MonthlyClosureView {
  return {
    periodClosesAt,
    periodStartsAt: periodClosesAt,
    periodLabel: periodClosesAt,
    modes: ['monthly'],
    issuableFrom: periodClosesAt,
    reached: true,
    floorAt: null,
    open: true,
    invoices: [],
    signaled: [],
    autopilotRun: null,
    batches: [],
  };
}

const FIRST = '2026-10-04T22:00:00.000Z';
const SECOND = '2026-10-11T22:00:00.000Z';

describe('closuresInOrder', () => {
  it('met la clôture du lot à préparer en tête, même écrite autrement', () => {
    const ordered = closuresInOrder([closure(FIRST), closure(SECOND)], '2026-10-12T00:00:00+02:00');

    expect(ordered.map((entry) => [entry.closure.periodClosesAt, entry.toPrepare])).toEqual([
      [SECOND, true],
      [FIRST, false],
    ]);
  });

  it("garde l'ordre du serveur sans clôture à préparer", () => {
    const ordered = closuresInOrder([closure(FIRST), closure(SECOND)], null);

    expect(ordered.map((entry) => entry.toPrepare)).toEqual([false, false]);
    expect(ordered.map((entry) => entry.closure.periodClosesAt)).toEqual([FIRST, SECOND]);
  });
});
