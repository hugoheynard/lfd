import { TestBed } from '@angular/core/testing';
import type { DueThresholdView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { readTranches, WorksheetTranches } from './worksheet-tranches';

/** Le croissant de Hugo : 400 avant 05:00, +800 avant 07:00, +800 avant 12:00. */
const CROISSANT: readonly DueThresholdView[] = [
  { kind: 'deadline', before: '05:00', quantity: 400, cumulative: 400 },
  { kind: 'deadline', before: '07:00', quantity: 800, cumulative: 1200 },
  { kind: 'deadline', before: '12:00', quantity: 800, cumulative: 2000 },
];

const plain = (text: string | null | undefined): string =>
  (text ?? '').replace(/[\s\u202F\u00A0]+/gu, ' ').trim();

describe('readTranches', () => {
  it('met en avant la première tranche non couverte, avec ce qui lui manque', () => {
    const reading = readTranches(CROISSANT, 650);

    expect(reading.tranches.map((t) => [plain(t.label), t.covered, t.next])).toEqual([
      ['400 avant 05:00', true, false],
      ['1 200 avant 07:00', false, true],
      ['2 000 avant 12:00', false, false],
    ]);
    expect(plain(reading.missing)).toBe('Manque 550 avant 07:00');
  });

  it('ne réclame rien quand tout est couvert', () => {
    const reading = readTranches(CROISSANT, 2000);

    expect(reading.tranches.every((t) => t.covered && !t.next)).toBe(true);
    expect(reading.missing).toBeNull();
  });

  it('dit l’avant-première-tranche à son heure de tranche, et la journée', () => {
    expect(
      plain(
        readTranches(
          [
            {
              kind: 'before_first',
              before: '05:00',
              quantity: 120,
              cumulative: 120,
              earliest: '04:30',
            },
          ],
          0,
        ).missing,
      ),
    ).toBe('Manque 120 avant 05:00');
    expect(
      plain(
        readTranches([{ kind: 'day', before: null, quantity: 40, cumulative: 40 }], 10).missing,
      ),
    ).toBe('Manque 30 dans la journée');
  });
});

describe('WorksheetTranches', () => {
  it('montre la ligne cumulée et le sorti en face', () => {
    const fixture = TestBed.createComponent(WorksheetTranches);
    fixture.componentRef.setInput('thresholds', CROISSANT);
    fixture.componentRef.setInput('produced', 650);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect([...el.querySelectorAll('[data-tranche]')].map((n) => plain(n.textContent))).toEqual([
      '400 avant 05:00',
      '1 200 avant 07:00',
      '2 000 avant 12:00',
    ]);
    expect(plain(el.querySelector('.wt-produced')?.textContent)).toBe('— sorti 650');
    expect(plain(el.querySelector('.is-next')?.textContent)).toBe('1 200 avant 07:00');
    expect(plain(el.querySelector('[data-tranche-missing]')?.textContent)).toBe(
      'Manque 550 avant 07:00',
    );
  });
});
