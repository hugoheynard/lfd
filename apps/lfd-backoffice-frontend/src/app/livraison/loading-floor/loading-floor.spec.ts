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
    expect(stacks[0]?.querySelector('text')?.textContent?.trim()).toBe('6·5');
  });

  it('nomme les piles qui ne tiennent pas au sol', () => {
    const element = render({ ...FLOOR, wheelArches: null });

    expect(element.querySelectorAll('[data-arch]')).toHaveLength(0);
    expect(element.querySelector('[data-floor-off]')?.textContent).toContain(
      'Hors plancher : pile 2 (arrêt 1)',
    );
  });
});
