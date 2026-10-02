import type { DeliveryLoadingPlanStackView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { floorStackShapes, unplacedStacksLabel } from './delivery-loading-floor';

function stack(
  stackIndex: number,
  placement: DeliveryLoadingPlanStackView['placement'],
  stopPositions: readonly number[] = [stackIndex],
): DeliveryLoadingPlanStackView {
  return { stackIndex, binTypeName: 'Bac M', height: 2, maxStack: 5, stopPositions, placement };
}

const ON_FLOOR = {
  kind: 'floor',
  row: 2,
  xCm: 61,
  yCm: 10,
  depthCm: 40,
  widthCm: 60,
  orientation: 'turned',
} as const;

describe('floorStackShapes', () => {
  it('dessine les seules piles au sol, numérotées par arrêt du bas vers le haut', () => {
    const shapes = floorStackShapes([
      stack(1, ON_FLOOR, [6, 5]),
      stack(2, { kind: 'off_floor' }),
      stack(3, { kind: 'refrigerated' }),
      stack(4, null),
    ]);

    expect(shapes).toEqual([
      {
        stackIndex: 1,
        x: 61,
        y: 10,
        depth: 40,
        across: 60,
        label: '6·5',
        title: 'Pile 1 · Bac M — arrêts 6, 5',
        fontSize: 16,
      },
    ]);
  });
});

describe('unplacedStacksLabel', () => {
  it('nomme les piles hors plancher et leurs arrêts', () => {
    const stacks = [
      stack(1, ON_FLOOR),
      stack(2, { kind: 'off_floor' }, [2, 1]),
      stack(3, { kind: 'off_floor' }),
    ];

    expect(unplacedStacksLabel(stacks, 'off_floor')).toBe(
      'Hors plancher : pile 2 (arrêts 2, 1) ; pile 3 (arrêt 3)',
    );
    expect(unplacedStacksLabel(stacks, 'refrigerated')).toBeNull();
  });
});
