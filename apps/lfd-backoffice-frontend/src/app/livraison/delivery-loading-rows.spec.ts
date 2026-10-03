import type {
  DeliveryLoadingPlanBinView,
  DeliveryLoadingPlanStackView,
  DeliveryLoadingPlanStepView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  binTypeLabel,
  currentRow,
  floorRows,
  locateBin,
  outOfRowNotice,
} from './delivery-loading-rows';

function bin(
  binId: string,
  stackIndex: number,
  extra: Partial<DeliveryLoadingPlanBinView> = {},
): DeliveryLoadingPlanBinView {
  return {
    binId,
    code: binId.toUpperCase(),
    reference: 'CMD-6',
    binTypeName: 'Bac M',
    half: null,
    sharedWithReference: null,
    isotherm: false,
    stackIndex,
    ...extra,
  };
}

function floorStack(
  stackIndex: number,
  row: number,
  xCm: number,
  yCm: number,
): DeliveryLoadingPlanStackView {
  return {
    stackIndex,
    binTypeName: 'Bac M',
    height: 2,
    maxStack: 5,
    stopPositions: [],
    placement: { kind: 'floor', row, xCm, yCm, depthCm: 60, widthCm: 40, orientation: 'length' },
  };
}

// Ordre de chargement : arrêt 6 d'abord (au fond), puis 5 ; une moitié de CMD-4 chargée avec 5.
const ORDER: readonly DeliveryLoadingPlanStepView[] = [
  {
    step: 1,
    stopPosition: 6,
    reference: 'CMD-6',
    customerLabel: 'Les Balcons',
    bins: [bin('a1', 2), bin('a2', 1)],
  },
  {
    step: 2,
    stopPosition: 5,
    reference: 'CMD-5',
    customerLabel: 'Le Refuge',
    bins: [
      bin('b1', 1, { reference: 'CMD-5', isotherm: true }),
      bin('s1', 3, { reference: 'CMD-4', half: 'left', sharedWithReference: 'CMD-5' }),
    ],
  },
  { step: 3, stopPosition: 4, reference: 'CMD-4', customerLabel: 'Chez Jo', bins: [] },
];

const STACKS: readonly DeliveryLoadingPlanStackView[] = [
  floorStack(1, 1, 0, 0),
  floorStack(2, 1, 0, 50),
  floorStack(3, 2, 60, 0),
  { ...floorStack(4, 0, 0, 0), placement: { kind: 'off_floor' } },
];

describe('floorRows', () => {
  const rows = floorRows([...STACKS].reverse(), ORDER, new Set(['a2:whole']));

  it('range les rangées du fond vers les portes, et les piles de gauche à droite', () => {
    expect(rows.map((r) => r.label)).toEqual(['Rangée 1', 'Rangée 2']);
    expect(rows[0]?.stacks.map((s) => s.stackIndex)).toEqual([1, 2]);
    expect(rows[1]).toMatchObject({ x: 60, depth: 60 });
  });

  it('donne les bacs d’une pile du bas vers le haut, dans l’ordre de chargement', () => {
    const pile1 = rows[0]?.stacks[0];
    expect(pile1?.bins.map((b) => b.code)).toEqual(['A2', 'B1']);
    expect(pile1?.bins[1]).toMatchObject({
      typeLabel: 'Bac M · ❄',
      stopPosition: 5,
      customerLabel: 'Le Refuge',
      loaded: false,
    });
    expect(pile1?.bins[0]?.loaded).toBe(true);
  });

  it('rend une moitié partagée au client de SA commande, pas de l’étape qui la charge', () => {
    expect(rows[1]?.stacks[0]?.bins[0]).toMatchObject({
      typeLabel: 'Bac M · ½ gauche',
      stopPosition: 4,
      customerLabel: 'Chez Jo',
    });
  });

  it('laisse le hors-plancher hors des rangées et compte les bacs', () => {
    expect(rows.flatMap((r) => r.stacks.map((s) => s.stackIndex))).not.toContain(4);
    expect(rows[0]).toMatchObject({ binCount: 3, loadedCount: 1 });
  });

  it('suggère la première rangée, depuis le fond, qui a encore un bac à charger', () => {
    expect(currentRow(rows)).toBe(1);
    const allFirst = floorRows(STACKS, ORDER, new Set(['a1:whole', 'a2:whole', 'b1:whole']));
    expect(currentRow(allFirst)).toBe(2);
    expect(
      currentRow(
        floorRows(STACKS, ORDER, new Set(['a1:whole', 'a2:whole', 'b1:whole', 's1:left'])),
      ),
    ).toBeNull();
  });
});

describe('locateBin / outOfRowNotice', () => {
  const rows = floorRows(STACKS, ORDER, new Set());

  it('retrouve un bac par code court ou par identifiant', () => {
    expect(locateBin(rows, { code: 'S1' })).toEqual({ row: 2, stackIndex: 3, code: 'S1' });
    expect(locateBin(rows, { binId: 'a1' })).toEqual({ row: 1, stackIndex: 2, code: 'A1' });
    expect(locateBin(rows, { code: 'ZZZ999' })).toBeNull();
  });

  it('dit où va un bac d’une autre rangée, et se tait sinon', () => {
    expect(outOfRowNotice({ row: 2, stackIndex: 3, code: 'S1' }, 1)).toBe(
      'Le bac S1 va rangée 2, pile 3 — pas dans cette rangée.',
    );
    expect(outOfRowNotice({ row: 1, stackIndex: 2, code: 'A1' }, 1)).toBeNull();
    expect(outOfRowNotice(null, 1)).toBeNull();
  });
});

describe('binTypeLabel', () => {
  it('dit le type, la moitié et l’isotherme', () => {
    expect(binTypeLabel({ binTypeName: 'Bac S', half: 'right', isotherm: true })).toBe(
      'Bac S · ½ droite · ❄',
    );
  });
});
