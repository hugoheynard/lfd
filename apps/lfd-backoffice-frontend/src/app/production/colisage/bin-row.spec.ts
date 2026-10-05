import type { BinTypeView, DeliveryPackingProposalView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { binFormatButtons } from './bin-row';

function type(over: Partial<BinTypeView>): BinTypeView {
  return {
    id: 't-m',
    name: 'Bac M',
    outer: { lengthCm: 60, widthCm: 40, heightCm: 22 },
    inner: { lengthCm: 56, widthCm: 36, heightCm: 20 },
    innerVolumeLiters: 40,
    isotherm: false,
    maxStack: 6,
    divisible: false,
    archivedAt: null,
    ...over,
  };
}

function proposal(over: Partial<DeliveryPackingProposalView>): DeliveryPackingProposalView {
  return {
    orderId: 'o-1',
    reference: 'CMD-1',
    lines: [],
    bins: [],
    unplaced: [],
    shareCandidate: null,
    ...over,
  };
}

describe('la rangée « + format » (lot PC1)', () => {
  it('un bouton par type en service, « ½ » pour un cloisonnable, jamais un archivé', () => {
    const buttons = binFormatButtons(
      [
        type({ id: 't-s', name: 'Bac S', isotherm: true }),
        type({ id: 't-l', name: 'Bac L', divisible: true }),
        type({ id: 't-old', name: 'Vieux bac', archivedAt: '2026-01-01T00:00:00.000Z' }),
      ],
      null,
    );

    expect(buttons.map((button) => button.label)).toEqual(['+ Bac S ❄', '+ Bac L', '+ ½ Bac L']);
    expect(buttons.some((button) => button.proposed)).toBe(false);
  });

  it('🔴 met en avant le format proposé (Q2) — l’entier et la moitié séparément', () => {
    const buttons = binFormatButtons(
      [type({ id: 't-m' }), type({ id: 't-l', name: 'Bac L', divisible: true })],
      proposal({
        bins: [
          {
            binTypeId: 't-l',
            binTypeName: 'Bac L',
            isotherm: false,
            cold: false,
            whole: 0,
            half: true,
            fill: 0.5,
            content: [],
          },
        ],
      }),
    );

    expect(buttons.map((button) => [button.label, button.proposed])).toEqual([
      ['+ Bac M', false],
      ['+ Bac L', false],
      ['+ ½ Bac L', true],
    ]);
  });
});
