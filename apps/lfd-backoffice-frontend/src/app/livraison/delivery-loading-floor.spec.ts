import type { DeliveryLoadingPlanStackView, DeliveryLoadingPlanStepView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  floorLegend,
  floorStackShapes,
  loadedStackIndexes,
  STOP_HUE_COUNT,
  stopHue,
  unplacedStacksLabel,
} from './delivery-loading-floor';

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
        bands: [
          { stopPosition: 6, hue: stopHue(6), offset: 0, depth: 20 },
          { stopPosition: 5, hue: stopHue(5), offset: 20, depth: 20 },
        ],
        loaded: false,
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

describe('stopHue', () => {
  it('donne deux teintes différentes à deux arrêts consécutifs, en boucle sur la palette', () => {
    expect(stopHue(1)).toBe(0);
    expect(stopHue(2)).not.toBe(stopHue(1));
    expect(stopHue(1 + STOP_HUE_COUNT)).toBe(stopHue(1));
  });
});

describe('floorStackShapes — G6', () => {
  it('partage la pile en une tranche colorée par arrêt et marque la pile chargée', () => {
    const [shape] = floorStackShapes([stack(1, ON_FLOOR, [6, 5])], new Set([1]));

    expect(shape?.bands).toEqual([
      { stopPosition: 6, hue: stopHue(6), offset: 0, depth: 20 },
      { stopPosition: 5, hue: stopHue(5), offset: 20, depth: 20 },
    ]);
    expect(shape?.loaded).toBe(true);
    expect(shape?.label).toBe('✓ 6·5');
    expect(shape?.title).toContain('chargée');
  });
});

function bin(stackIndex: number, binId: string): DeliveryLoadingPlanStepView['bins'][number] {
  return {
    binId,
    code: binId,
    reference: 'CMD-1',
    binTypeName: 'Bac M',
    half: null,
    sharedWithReference: null,
    isotherm: false,
    stackIndex,
  };
}

function step(
  stopPosition: number,
  bins: DeliveryLoadingPlanStepView['bins'],
): DeliveryLoadingPlanStepView {
  return {
    step: 1,
    stopPosition,
    reference: `CMD-${String(stopPosition)}`,
    customerLabel: `Client ${String(stopPosition)}`,
    bins,
  };
}

describe('loadedStackIndexes', () => {
  it('ne marque chargée qu’une pile dont TOUS les bacs sont scannés', () => {
    const order = [step(2, [bin(1, 'a'), bin(2, 'b')]), step(1, [bin(1, 'c')])];

    expect([...loadedStackIndexes(order, new Set(['a:whole', 'b:whole']))]).toEqual([2]);
    expect([...loadedStackIndexes(order, new Set(['a:whole', 'c:whole']))]).toEqual([1]);
  });
});

describe('floorLegend', () => {
  it('liste les seuls arrêts dessinés au sol, dans l’ordre de la tournée', () => {
    const legend = floorLegend(
      [stack(1, ON_FLOOR, [3, 1]), stack(2, { kind: 'off_floor' }, [2])],
      [step(3, []), step(2, []), step(1, [])],
    );

    expect(legend).toEqual([
      { stopPosition: 1, hue: stopHue(1), label: 'Client 1 · CMD-1' },
      { stopPosition: 3, hue: stopHue(3), label: 'Client 3 · CMD-3' },
    ]);
  });
});
