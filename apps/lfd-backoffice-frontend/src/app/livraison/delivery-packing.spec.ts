import type { DeliveryBinView, DeliveryPackingBinView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  declaredDiffersFromProposal,
  declaredSummary,
  freeHalfLabel,
  packingContentLabel,
  packingFillLabel,
  proposalDeclarations,
  proposalSummary,
  shareCandidateLabel,
  unplacedReasonLabel,
  withoutReplacedBin,
} from './delivery-packing';

function entry(overrides: Partial<DeliveryPackingBinView>): DeliveryPackingBinView {
  return {
    binTypeId: 't-m',
    binTypeName: 'Bac M',
    isotherm: false,
    cold: false,
    whole: 2,
    half: false,
    fill: 0.8,
    content: [],
    ...overrides,
  };
}

const M = entry({});
const HALF_S = entry({ binTypeId: 't-s', binTypeName: 'Bac S', whole: 0, half: true, fill: 0.5 });
const COLD = entry({
  binTypeId: 't-iso',
  binTypeName: 'Bac S isotherme',
  isotherm: true,
  cold: true,
  whole: 1,
});

function declared(typeId: string, half: DeliveryBinView['half'], voided = false) {
  return {
    voidedAt: voided ? '2026-10-01T05:00:00.000Z' : null,
    half,
    binType: {
      id: typeId,
      name: typeId === 't-m' ? 'Bac M' : 'Bac S',
      isotherm: false,
      archived: false,
    },
  };
}

describe('proposalSummary', () => {
  it('dit le sec, puis le froid entre parenthèses', () => {
    expect(proposalSummary([COLD, M, HALF_S])).toBe('2 × Bac M · ½ Bac S (❄ 1 × Bac S isotherme)');
  });

  it('le froid seul, sans parenthèses ; rien, vide', () => {
    expect(proposalSummary([COLD])).toBe('❄ 1 × Bac S isotherme');
    expect(proposalSummary([])).toBe('');
  });

  it('des entiers ET une moitié du même type', () => {
    expect(proposalSummary([{ ...M, half: true }])).toBe('2 × Bac M · ½ Bac M');
  });
});

describe('packingContentLabel', () => {
  it('nomme par le nom figé, le SKU à défaut', () => {
    const bin = entry({
      content: [
        { sku: 'CRO', quantity: 12 },
        { sku: 'X-1', quantity: 3 },
      ],
    });
    expect(packingContentLabel(bin, [{ sku: 'CRO', name: 'Croissant' }])).toBe(
      '12 × Croissant · 3 × X-1',
    );
  });
});

describe('packingFillLabel', () => {
  it('le dernier bac, ou la moitié', () => {
    expect(packingFillLabel(M)).toBe('Dernier bac rempli à 80 %');
    expect(packingFillLabel(HALF_S)).toBe('Moitié remplie à 50 %');
  });
});

describe('unplacedReasonLabel', () => {
  it('dit la raison et le geste', () => {
    expect(unplacedReasonLabel('no_capacity')).toBe(
      'sans contenance : renseignez-la dans Livraison › Contenances',
    );
    expect(unplacedReasonLabel('cold_without_isotherm')).toBe(
      'demande le froid, aucun bac isotherme ne le contient',
    );
  });
});

describe('proposalDeclarations', () => {
  it('une déclaration par entrée, les sacs saisis une fois', () => {
    expect(proposalDeclarations('o-1', [COLD, M, HALF_S], 2)).toEqual([
      { orderId: 'o-1', binTypeId: 't-iso', whole: 1, half: false, innerBags: 2 },
      { orderId: 'o-1', binTypeId: 't-m', whole: 2, half: false, innerBags: 2 },
      { orderId: 'o-1', binTypeId: 't-s', whole: 0, half: true, innerBags: 2 },
    ]);
  });

  it('au-delà de 20 entiers, plusieurs déclarations — la moitié part avec la dernière', () => {
    expect(
      proposalDeclarations('o-1', [{ ...M, whole: 45, half: true }], 0).map((p) => [
        p.whole,
        p.half,
      ]),
    ).toEqual([
      [20, false],
      [20, false],
      [5, true],
    ]);
  });

  it('une entrée vide ne déclare rien', () => {
    expect(proposalDeclarations('o-1', [{ ...M, whole: 0 }], 0)).toEqual([]);
  });
});

describe('withoutReplacedBin', () => {
  it('ôte la moitié si l’entrée en a une, sinon un entier', () => {
    expect(withoutReplacedBin([M, HALF_S], 1)).toEqual([M]);
    expect(withoutReplacedBin([M, HALF_S], 0)[0]?.whole).toBe(1);
    expect(withoutReplacedBin([{ ...M, half: true }], 0)[0]).toMatchObject({
      whole: 2,
      half: false,
    });
  });
});

describe('declaredDiffersFromProposal', () => {
  it('rien de déclaré : aucun écart à dire', () => {
    expect(declaredDiffersFromProposal([], [M])).toBe(false);
    expect(declaredDiffersFromProposal([declared('t-m', null, true)], [M])).toBe(false);
  });

  it('les mêmes bacs par type, dans n’importe quel ordre : pas d’écart', () => {
    expect(
      declaredDiffersFromProposal(
        [declared('t-s', 'left'), declared('t-m', null), declared('t-m', null)],
        [M, HALF_S],
      ),
    ).toBe(false);
  });

  it('un bac de plus, ou un entier au lieu d’une moitié : écart', () => {
    expect(declaredDiffersFromProposal([declared('t-m', null)], [M])).toBe(true);
    expect(
      declaredDiffersFromProposal(
        [declared('t-m', null), declared('t-m', null), declared('t-s', null)],
        [M, HALF_S],
      ),
    ).toBe(true);
  });
});

describe('declaredSummary', () => {
  it('dit les vivants, comme la proposition', () => {
    expect(
      declaredSummary([
        declared('t-m', null),
        declared('t-m', null),
        declared('t-m', null, true),
        declared('t-s', 'left'),
      ]),
    ).toBe('2 × Bac M · ½ Bac S');
  });
});

describe('shareCandidateLabel', () => {
  const candidate = { binTypeName: 'Bac M', partnerReference: 'CMD-2', partnerBinId: 'h-2' };

  it('nomme le client et l’arrêt de la moitié partenaire', () => {
    expect(
      shareCandidateLabel(candidate, [{ binId: 'h-2', customerLabel: 'Le Refuge', position: 3 }]),
    ).toBe('En dernier recours : partager ½ Bac M avec Le Refuge, arrêt 3 — économise un bac');
  });

  it('à défaut, la référence de la commande', () => {
    expect(shareCandidateLabel(candidate, [])).toContain('avec CMD-2 —');
  });
});

describe('freeHalfLabel', () => {
  it('dit la commande, le type, le côté libre et l’arrêt', () => {
    expect(
      freeHalfLabel({
        reference: 'CMD-2',
        customerLabel: 'Le Refuge',
        binTypeName: 'Bac M',
        freeHalf: 'right',
        position: 1,
      }),
    ).toBe('CMD-2 · Le Refuge — ½ Bac M, côté droit libre (arrêt 1)');
  });
});
