import type { DeliveryLoadingBinView, DeliveryLoadingStopView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  binCountLabel,
  binIndexLabel,
  binKindLabel,
  binUrl,
  halfLabel,
  innerBagsLabel,
  missingStops,
  normalisedCode,
  parisTimeOf,
  scannedBin,
  sharedWithLabel,
  stopStateLabel,
} from './delivery-loading';

function stop(
  overrides: Partial<DeliveryLoadingStopView> & Pick<DeliveryLoadingStopView, 'state'>,
): DeliveryLoadingStopView {
  return {
    stopId: 's-1',
    orderId: 'o-1',
    reference: 'CMD-1',
    customerLabel: 'Le Comptoir',
    position: 1,
    bins: [],
    ...overrides,
  };
}

function bin(overrides: Partial<DeliveryLoadingBinView> = {}): DeliveryLoadingBinView {
  return {
    binId: 'b-1',
    code: 'ABC234',
    index: 1,
    binTypeName: 'Bac M',
    half: null,
    innerBags: 0,
    sharedWithReference: null,
    toRedo: false,
    loadedAt: null,
    ...overrides,
  };
}

const LOADED = bin({ loadedAt: '2026-09-29T05:00:00.000Z' });
const WAITING = bin({ binId: 'b-2', code: 'ABC235', index: 2 });

describe('scannedBin', () => {
  it('lit l’identifiant dans l’adresse d’un bac, absolue ou non', () => {
    expect(scannedBin('https://bo.example/livraison/bac/01J9ZX')).toEqual({ binId: '01J9ZX' });
    expect(scannedBin('  /livraison/bac/01J9ZX?x=1 ')).toEqual({ binId: '01J9ZX' });
  });

  it('lit un code court tapé, en le remettant à la forme de Crockford', () => {
    expect(scannedBin('abc-234')).toEqual({ code: 'ABC234' });
    expect(scannedBin('7K0 M1Q')).toEqual({ code: '7K0M1Q' });
  });

  it('🔴 refuse ce qui n’est pas un bac : feuille d’atelier, retrait, code trop court', () => {
    expect(scannedBin('https://bo.example/colisage/CMD-12')).toBeNull();
    expect(scannedBin('https://bo.example/retrait/abcdefgh12')).toBeNull();
    expect(scannedBin('ABC23')).toBeNull();
    expect(scannedBin('ABCU34')).toBeNull();
    expect(scannedBin('   ')).toBeNull();
  });
});

describe('normalisedCode', () => {
  it('lit O comme 0, I et L comme 1 (règle de Crockford)', () => {
    expect(normalisedCode('oil 234')).toBe('011234');
  });
});

describe('binUrl', () => {
  it('pose l’adresse absolue du bac, sans double barre', () => {
    expect(binUrl('https://bo.example/', 'b 1')).toBe('https://bo.example/livraison/bac/b%201');
  });
});

describe('binIndexLabel', () => {
  it('dit le rang, ou l’annulation', () => {
    expect(binIndexLabel({ index: 2, total: 3 })).toBe('bac 2 / 3');
    expect(binIndexLabel({ index: null, total: 3 })).toBe('bac annulé');
  });
});

describe('ce que dit l’étiquette', () => {
  it('nomme la moitié, ou rien pour un bac entier', () => {
    expect(halfLabel('left')).toBe('½ gauche');
    expect(halfLabel('right')).toBe('½ droite');
    expect(halfLabel(null)).toBeNull();
  });

  it('compte les sacs dedans, et se tait quand il n’y en a pas', () => {
    expect(innerBagsLabel(0)).toBeNull();
    expect(innerBagsLabel(1)).toBe('1 sac dedans');
    expect(innerBagsLabel(2)).toBe('2 sacs dedans');
  });

  it('dit le type, la moitié et les sacs, dans cet ordre', () => {
    expect(binKindLabel(bin({ half: 'left', innerBags: 2 }))).toBe(
      'Bac M · ½ gauche · 2 sacs dedans',
    );
    expect(binKindLabel(bin())).toBe('Bac M');
  });

  it('nomme l’autre commande d’un bac partagé', () => {
    expect(sharedWithLabel({ reference: 'CMD-2', customerLabel: 'Le Refuge' })).toBe(
      'partagé avec CMD-2 · Le Refuge',
    );
  });
});

describe('binCountLabel', () => {
  it('compte les bacs chargés sur les bacs déclarés', () => {
    expect(binCountLabel(stop({ state: 'partial', bins: [LOADED, WAITING] }))).toBe('1 bac sur 2');
    expect(
      binCountLabel(stop({ state: 'loaded', bins: [LOADED, { ...LOADED, binId: 'b-3' }] })),
    ).toBe('2 bacs sur 2');
  });

  it('🔴 dit « aucun bac déclaré » plutôt que « 0 sur 0 » (L4-C17)', () => {
    expect(binCountLabel(stop({ state: 'unlabelled' }))).toBe('aucun bac déclaré');
  });
});

describe('stopStateLabel', () => {
  it('met l’arrêt sans bac en rouge', () => {
    expect(stopStateLabel('unlabelled').variant).toBe('alert');
    expect(stopStateLabel('partial').variant).toBe('warning');
    expect(stopStateLabel('loaded').variant).toBe('success');
  });
});

describe('missingStops', () => {
  it('liste ce qui n’est pas chargé, sans étiquette comprise, dans l’ordre servi', () => {
    const missing = missingStops({
      stops: [
        stop({ stopId: 's-1', reference: 'CMD-1', state: 'loaded', bins: [LOADED] }),
        stop({ stopId: 's-2', reference: 'CMD-2', state: 'unlabelled' }),
        stop({ stopId: 's-3', reference: 'CMD-3', state: 'partial', bins: [LOADED, WAITING] }),
      ],
    });
    expect(missing.map((line) => [line.reference, line.detail])).toEqual([
      ['CMD-2', 'aucun bac déclaré'],
      ['CMD-3', '1 bac sur 2'],
    ]);
  });

  it('🔴 garde un arrêt CHARGÉ qui porte un bac partagé à refaire (v2-4)', () => {
    const missing = missingStops({
      stops: [
        stop({
          reference: 'CMD-1',
          state: 'loaded',
          bins: [{ ...LOADED, half: 'left', sharedWithReference: 'CMD-3', toRedo: true }],
        }),
      ],
    });
    expect(missing.map((line) => line.detail)).toEqual(['bac partagé à refaire · 1 bac sur 1']);
  });
});

describe('parisTimeOf', () => {
  it('dit l’heure de Paris', () => {
    expect(parisTimeOf('2026-09-29T05:42:00.000Z')).toBe('7 h 42');
  });
});
