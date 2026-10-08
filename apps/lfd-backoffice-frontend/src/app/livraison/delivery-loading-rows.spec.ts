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
  nextBin,
  outOfRowNotice,
  stackTiles,
} from './delivery-loading-rows';
import { overArchClause, placementLine } from './delivery-loading-placement';

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
    behind: false,
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
    binTypeHeightCm: 22,
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

// Un bac partagé : CMD-2 (gauche) et CMD-1 (droite), chargés à l'étape de
// l'arrêt 2, en haut de la pile 1, au-dessus d'un bac de l'arrêt 3.
const SHARED_ORDER: readonly DeliveryLoadingPlanStepView[] = [
  {
    step: 1,
    stopPosition: 3,
    reference: 'CMD-3',
    customerLabel: 'Hôtel des Cimes',
    bins: [bin('c1', 1, { reference: 'CMD-3' })],
  },
  {
    step: 2,
    stopPosition: 2,
    reference: 'CMD-2',
    customerLabel: 'Chalet',
    bins: [
      bin('h1', 1, { reference: 'CMD-2', half: 'left', sharedWithReference: 'CMD-1' }),
      bin('h2', 1, { reference: 'CMD-1', half: 'right', sharedWithReference: 'CMD-2' }),
      bin('d1', 2, { reference: 'CMD-2' }),
    ],
  },
  {
    step: 3,
    stopPosition: 1,
    reference: 'CMD-1',
    customerLabel: 'Bistrot',
    bins: [bin('e1', 1, { reference: 'CMD-1' })],
  },
];

describe('stackTiles', () => {
  it('réunit les deux moitiés d’un bac partagé en une seule tuile', () => {
    const pile1 = stackTiles(SHARED_ORDER, new Set(['h1:left'])).get(1) ?? [];
    expect(pile1.map((tile) => tile.stopPositions)).toEqual([[3], [2, 1], [1]]);
    expect(pile1[1]).toMatchObject({ shared: true, half: true, loaded: false });
  });
});

describe('nextBin', () => {
  const plan = { order: ORDER };

  it('suit l’ordre du plan', () => {
    expect(nextBin(plan, new Set(), null)?.key).toBe('a1:whole');
    expect(nextBin(plan, new Set(['a1:whole']), null)?.key).toBe('a2:whole');
  });

  it('donne la priorité au bac désigné, au client de SA commande', () => {
    expect(nextBin(plan, new Set(), 's1:left')).toMatchObject({
      key: 's1:left',
      stopPosition: 4,
      customerLabel: 'Chez Jo',
    });
  });

  it('reprend l’ordre quand le bac désigné est déjà chargé', () => {
    expect(nextBin(plan, new Set(['b1:whole']), 'b1:whole')?.key).toBe('a1:whole');
  });

  it('rend null quand tout est chargé', () => {
    const all = new Set(['a1:whole', 'a2:whole', 'b1:whole', 's1:left']);
    expect(nextBin(plan, all, null)).toBeNull();
  });
});

describe('placementLine', () => {
  const plan = { order: ORDER, stacks: STACKS };

  it('au sol, en bas de sa pile, à gauche de la rangée du fond', () => {
    expect(placementLine(plan, { binId: 'a2', half: null })).toEqual({
      lead: 'Rangée 1 (le fond) · pile 1',
      detail: 'à gauche, en bas',
    });
  });

  it('au sol, sur le bac de l’arrêt du dessous', () => {
    expect(placementLine(plan, { binId: 'b1', half: null })).toEqual({
      lead: 'Rangée 1 (le fond) · pile 1',
      detail: 'à gauche, sur le bac de l’arrêt 6',
    });
    expect(placementLine(plan, { binId: 's1', half: 'left' })?.lead).toBe(
      'Rangée 2 (les portes) · pile 3',
    );
  });

  it('au sol, sur un bac partagé', () => {
    const shared = {
      order: SHARED_ORDER,
      stacks: [floorStack(1, 1, 0, 0), floorStack(2, 1, 0, 50)],
    };
    expect(placementLine(shared, { binId: 'e1', half: null })).toEqual({
      lead: 'Rangée 1 (le fond) · pile 1',
      detail: 'à gauche, sur le bac partagé 2·1',
    });
    expect(placementLine(shared, { binId: 'h2', half: 'right' })?.detail).toBe(
      'à gauche, sur le bac de l’arrêt 3',
    );
    expect(placementLine(shared, { binId: 'd1', half: null })?.detail).toBe('à droite, en bas');
  });

  it('au-dessus d’un passage de roue : le flanc, l’étage de départ et la hauteur bornée', () => {
    const arched = {
      order: ORDER,
      stacks: STACKS.map((stack) =>
        stack.stackIndex === 1 && stack.placement?.kind === 'floor'
          ? {
              ...stack,
              placement: {
                ...stack.placement,
                overArch: { side: 'right' as const, fromLevel: 2, levels: 3 },
              },
            }
          : stack,
      ),
    };
    expect(placementLine(arched, { binId: 'a2', half: null })).toEqual({
      lead: 'Rangée 1 (le fond) · pile 1',
      detail: 'au-dessus du passage de roue droit, à partir de l’étage 2, 3 bacs au plus, en bas',
    });
    expect(overArchClause({ side: 'left', fromLevel: 1, levels: 1 })).toBe(
      'au-dessus du passage de roue gauche, à partir de l’étage 1, 1 bac au plus',
    );
  });

  it('sans plancher : la pile et son type', () => {
    const unplaced = {
      order: ORDER,
      stacks: STACKS.map((stack) => ({ ...stack, placement: null })),
    };
    expect(placementLine(unplaced, { binId: 'b1', half: null })).toEqual({
      lead: 'Pile 1 · Bac M',
      detail: 'sur le bac de l’arrêt 6',
    });
  });

  it('réfrigéré, et hors plancher', () => {
    const cold = {
      order: ORDER,
      stacks: STACKS.map((stack) =>
        stack.stackIndex === 1 ? { ...stack, placement: { kind: 'refrigerated' as const } } : stack,
      ),
    };
    expect(placementLine(cold, { binId: 'b1', half: null })).toEqual({
      lead: 'Caisse froide ❄',
      detail: 'hors plancher · au froid',
    });
    const over = {
      order: [
        ...ORDER,
        {
          step: 4,
          stopPosition: 3,
          reference: 'CMD-6',
          customerLabel: 'Loin',
          bins: [bin('o1', 4)],
        },
      ],
      stacks: STACKS,
    };
    expect(placementLine(over, { binId: 'o1', half: null })).toEqual({
      lead: 'Pile 4 · hors plancher',
      detail: 'en bas',
    });
  });

  it('rend null pour un bac hors du plan', () => {
    expect(placementLine(plan, { binId: 'zz', half: null })).toBeNull();
  });
});
