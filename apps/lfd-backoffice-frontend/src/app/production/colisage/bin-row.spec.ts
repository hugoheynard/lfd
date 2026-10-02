import type { BinTypeView, DeliveryBinView, DeliveryPackingProposalView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  binFormatButtons,
  declaredBinLabel,
  declaredCountLabel,
  lastLiveBin,
  oneBinPayload,
  readyWarnings,
} from './bin-row';

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

function bin(over: Partial<DeliveryBinView>): DeliveryBinView {
  return {
    binId: 'b-1',
    code: 'ABC234',
    orderId: 'o-1',
    reference: 'CMD-1',
    customerLabel: 'Le Refuge',
    index: 1,
    total: 1,
    voidedAt: null,
    binType: { id: 't-m', name: 'Bac M', isotherm: false, archived: false },
    half: null,
    physicalBinId: 'p-1',
    innerBags: 0,
    sharedWith: null,
    toRedo: false,
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

  it('un appui déclare UN bac : un entier, ou la seule moitié', () => {
    expect(oneBinPayload('o-1', { binTypeId: 't-m', half: false }, 2)).toEqual({
      orderId: 'o-1',
      binTypeId: 't-m',
      whole: 1,
      half: false,
      innerBags: 2,
    });
    expect(oneBinPayload('o-1', { binTypeId: 't-l', half: true }, 0)).toMatchObject({
      whole: 0,
      half: true,
    });
  });

  it('« − » vise le DERNIER bac vivant, jamais un annulé', () => {
    const bins = [
      bin({ binId: 'b-1' }),
      bin({ binId: 'b-2' }),
      bin({ binId: 'b-3', voidedAt: '2026-10-01T05:00:00.000Z' }),
    ];

    expect(lastLiveBin(bins)?.binId).toBe('b-2');
    expect(lastLiveBin([])).toBeNull();
  });

  it('dit le compte et le format des bacs déclarés', () => {
    expect([0, 1, 3].map(declaredCountLabel)).toEqual(['aucun bac', '1 bac', '3 bacs']);
    expect(declaredBinLabel(bin({ half: 'left' }))).toBe('Bac M · ½ gauche');
  });
});

describe('les avertissements de « Prête » (D3)', () => {
  const cold = proposal({
    lines: [{ sku: 'TAR', name: 'Tarte', quantity: 2, requiresCold: true }],
  });

  it('aucun bac sur une livraison', () => {
    expect(readyWarnings([], null)).toEqual(['Aucun bac déclaré pour cette livraison.']);
    expect(readyWarnings([bin({ voidedAt: '2026-10-01T05:00:00.000Z' })], null)).toEqual([
      'Aucun bac déclaré pour cette livraison.',
    ]);
  });

  it('du froid sans bac isotherme', () => {
    expect(readyWarnings([bin({})], cold)).toEqual([
      'La commande contient du froid, aucun bac isotherme.',
    ]);
  });

  it('rien quand un isotherme est déclaré, ou quand on ne sait pas s’il y a du froid', () => {
    const isotherm = bin({
      binType: { id: 't-s', name: 'Bac S', isotherm: true, archived: false },
    });
    expect(readyWarnings([bin({}), isotherm], cold)).toEqual([]);
    expect(readyWarnings([bin({})], null)).toEqual([]);
  });
});
