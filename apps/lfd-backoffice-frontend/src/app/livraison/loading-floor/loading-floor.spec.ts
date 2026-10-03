import { TestBed } from '@angular/core/testing';
import type { DeliveryLoadingPlanFloorView, DeliveryLoadingPlanStackView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { LoadingFloor } from './loading-floor';

const FLOOR: DeliveryLoadingPlanFloorView = {
  lengthCm: 250,
  widthCm: 160,
  wheelArches: { fromBackCm: 100, lengthCm: 80, protrusionCm: 20 },
};

const STACKS: readonly DeliveryLoadingPlanStackView[] = [
  {
    stackIndex: 1,
    binTypeName: 'Bac M',
    height: 5,
    maxStack: 5,
    stopPositions: [6, 5],
    placement: {
      kind: 'floor',
      row: 1,
      xCm: 0,
      yCm: 0,
      depthCm: 60,
      widthCm: 40,
      orientation: 'length',
    },
  },
  {
    stackIndex: 2,
    binTypeName: 'Bac M',
    height: 1,
    maxStack: 5,
    stopPositions: [1],
    placement: { kind: 'off_floor' },
  },
];

function render(floor: DeliveryLoadingPlanFloorView): HTMLElement {
  const fixture = TestBed.createComponent(LoadingFloor);
  fixture.componentRef.setInput('floor', floor);
  fixture.componentRef.setInput('stacks', STACKS);
  fixture.componentRef.setInput('order', [
    { step: 1, stopPosition: 6, reference: 'CMD-6', customerLabel: 'Les Balcons', bins: [] },
    { step: 2, stopPosition: 5, reference: 'CMD-5', customerLabel: 'Le Refuge', bins: [] },
  ]);
  fixture.componentRef.setInput('loadedStacks', new Set([1]));
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('LoadingFloor', () => {
  it('dessine le plancher, ses passages de roue et les piles numérotées par arrêt', () => {
    const element = render(FLOOR);

    expect(element.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 258 168');
    expect(element.querySelectorAll('[data-arch]')).toHaveLength(2);
    const stacks = element.querySelectorAll('[data-floor-stack]');
    expect(stacks).toHaveLength(1);
    expect(stacks[0]?.querySelector('text')?.textContent?.trim()).toBe('✓ 6·5');
  });

  it('colore une tranche par arrêt, marque la pile chargée et légende arrêt → client', () => {
    const element = render(FLOOR);

    const stack = element.querySelector('[data-floor-stack]');
    expect(stack?.hasAttribute('data-loaded')).toBe(true);
    expect(stack?.querySelectorAll('[data-floor-band]')).toHaveLength(2);
    const legend = [...element.querySelectorAll('[data-floor-legend]')].map((li) =>
      li.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(legend).toEqual(['5 Le Refuge · CMD-5', '6 Les Balcons · CMD-6']);
  });

  it('nomme les piles qui ne tiennent pas au sol', () => {
    const element = render({ ...FLOOR, wheelArches: null });

    expect(element.querySelectorAll('[data-arch]')).toHaveLength(0);
    expect(element.querySelector('[data-floor-off]')?.textContent).toContain(
      'Hors plancher : pile 2 (arrêt 1)',
    );
  });

  it('dessine les rangées, et un toucher sur une rangée ouvre « Quoi mettre ici »', () => {
    const fixture = TestBed.createComponent(LoadingFloor);
    fixture.componentRef.setInput('floor', FLOOR);
    fixture.componentRef.setInput('stacks', STACKS);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    const rows = element.querySelectorAll<SVGGElement>('[data-floor-row]');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.getAttribute('role')).toBe('button');
    expect(rows[0]?.getAttribute('aria-label')).toContain('Rangée 1 (le fond)');
    expect(element.querySelector('[data-row-panel]')).toBeNull();

    rows[0]?.dispatchEvent(new MouseEvent('click'));
    fixture.detectChanges();
    expect(rows[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(element.querySelector('[data-row-panel]')?.textContent).toContain('Rangée 1');

    element.querySelector<HTMLButtonElement>('[data-row-close]')?.click();
    fixture.detectChanges();
    expect(element.querySelector('[data-row-panel]')).toBeNull();
  });

  it('ouvre la rangée d’une pile touchée au clavier, la pile mise en avant', () => {
    const fixture = TestBed.createComponent(LoadingFloor);
    fixture.componentRef.setInput('floor', FLOOR);
    fixture.componentRef.setInput('stacks', STACKS);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    const stack = element.querySelector('[data-floor-stack]');
    stack?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();
    expect(stack?.getAttribute('aria-pressed')).toBe('true');
    expect(stack?.querySelector('.stack--selected')).not.toBeNull();
    expect(element.querySelector('[data-row-stack]')?.classList).toContain('rp-stack--selected');
  });
});
