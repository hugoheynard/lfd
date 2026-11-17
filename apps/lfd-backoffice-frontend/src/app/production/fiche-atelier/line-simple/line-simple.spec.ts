import { TestBed } from '@angular/core/testing';
import type { WorkshopLine } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { LineSimple } from './line-simple';

/**
 * Une ligne « simple » : « Fait » dit ce que le serveur déclarera (le reste
 * sous le plafond, servi), disparaît quand il n'y a plus rien à déclarer, et
 * « Problème » reste offert.
 */

const LINE: WorkshopLine = {
  sku: 'SEI',
  productName: 'Pain de seigle',
  quantity: 30,
  saleUnit: 'piece',
  containerLabel: null,
  done: false,
  initials: null,
  doneAt: null,
  produced: 10,
  remaining: 20,
  surplus: 0,
  batches: [],
  container: null,
  trackingLevel: 'simple',
  ceiling: null,
  remainingUnderCeiling: 20,
  problem: null,
};

function render(line: WorkshopLine): { el: HTMLElement; events: string[] } {
  const fixture = TestBed.createComponent(LineSimple);
  fixture.componentRef.setInput('line', line);
  const events: string[] = [];
  fixture.componentInstance.done.subscribe(() => events.push('done'));
  fixture.componentInstance.problem.subscribe(() => events.push('problem'));
  fixture.detectChanges();
  return { el: fixture.nativeElement, events };
}

describe('une ligne simple', () => {
  it('« Fait » dit le reste servi et le remonte', () => {
    const { el, events } = render(LINE);
    const done = el.querySelector<HTMLButtonElement>('[data-line-done-button]');

    expect(done?.textContent?.trim()).toBe('Fait · 20');
    done?.click();
    expect(events).toEqual(['done']);
  });

  it('sous un plafond atteint, plus de « Fait » : le rouge reste dit', () => {
    const { el } = render({
      ...LINE,
      ceiling: 10,
      remainingUnderCeiling: 0,
      problem: {
        id: 'pb-1',
        version: 1,
        expected: 30,
        produced: 10,
        reason: 'pâte ratée',
        reportedAt: '2026-11-18T05:00:00.000Z',
      },
    });

    expect(el.querySelector('[data-line-done-button]')).toBeNull();
    expect(el.querySelector('[data-line-problem]')?.textContent).toContain('pâte ratée');
    expect(el.querySelector('[data-line-problem]')?.textContent).toContain('Plafond du jour : 10');
  });

  it('une ligne faite garde « Problème »', () => {
    const { el, events } = render({ ...LINE, done: true, produced: 30, remaining: 0 });

    expect(el.querySelector('[data-line-done-badge]')).not.toBeNull();
    el.querySelector<HTMLButtonElement>('[data-line-problem-button]')?.click();
    expect(events).toEqual(['problem']);
  });
});
