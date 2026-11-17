import { TestBed } from '@angular/core/testing';
import type { WorkshopLine } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { LineAlwaysGreen } from './line-always-green';

/**
 * Une ligne « toujours vert » : rien à cocher, les paliers tenus d'après les
 * fournées servies, un seul geste — « Problème ».
 */

const LINE: WorkshopLine = {
  sku: 'CRO',
  productName: 'Croissant',
  quantity: 240,
  saleUnit: 'piece',
  containerLabel: null,
  done: false,
  initials: null,
  doneAt: null,
  produced: 120,
  remaining: 120,
  surplus: 0,
  batches: [],
  container: null,
  deadlines: [
    { before: '07:00', quantity: 120 },
    { before: '11:00', quantity: 120 },
  ],
  trackingLevel: 'always_green',
  ceiling: null,
  remainingUnderCeiling: 120,
  problem: null,
};

function render(line: WorkshopLine): { el: HTMLElement; problems: number[] } {
  const fixture = TestBed.createComponent(LineAlwaysGreen);
  fixture.componentRef.setInput('line', line);
  const problems: number[] = [];
  fixture.componentInstance.problem.subscribe(() => problems.push(1));
  fixture.detectChanges();
  return { el: fixture.nativeElement, problems };
}

describe('une ligne toujours vert', () => {
  it('montre les paliers, tenus ou non, sans rien à cocher', () => {
    const { el } = render(LINE);
    const steps = [...el.querySelectorAll('[data-line-step]')].map((node) =>
      node.textContent?.trim(),
    );

    expect(steps).toEqual(['✓ 120 avant 7 h 00', '120 avant 11 h 00']);
    expect(el.querySelectorAll('button')).toHaveLength(1);
  });

  it('« Problème » est le seul geste', () => {
    const { el, problems } = render(LINE);

    el.querySelector<HTMLButtonElement>('[data-line-problem-button]')?.click();
    expect(problems).toHaveLength(1);
  });

  it('dit le plafond qui survit au « traité »', () => {
    const { el } = render({ ...LINE, ceiling: 100 });

    expect(el.querySelector('[data-line-problem]')).toBeNull();
    expect(el.querySelector('[data-line-ceiling]')?.textContent).toContain('Plafond du jour : 100');
  });
});
