import type { DeliveryLoadingStopView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  bagCountLabel,
  bagIndexLabel,
  bagUrl,
  missingStops,
  normalisedCode,
  parisTimeOf,
  scannedBag,
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
    bags: [],
    ...overrides,
  };
}

const LOADED = { bagId: 'b-1', code: 'ABC234', index: 1, loadedAt: '2026-09-29T05:00:00.000Z' };
const WAITING = { bagId: 'b-2', code: 'ABC235', index: 2, loadedAt: null };

describe('scannedBag', () => {
  it('lit l’identifiant dans l’adresse d’un sac, absolue ou non', () => {
    expect(scannedBag('https://bo.example/livraison/sac/01J9ZX')).toEqual({ bagId: '01J9ZX' });
    expect(scannedBag('  /livraison/sac/01J9ZX?x=1 ')).toEqual({ bagId: '01J9ZX' });
  });

  it('lit un code court tapé, en le remettant à la forme de Crockford', () => {
    expect(scannedBag('abc-234')).toEqual({ code: 'ABC234' });
    expect(scannedBag('7K0 M1Q')).toEqual({ code: '7K0M1Q' });
  });

  it('🔴 refuse ce qui n’est pas un sac : feuille d’atelier, retrait, code trop court', () => {
    expect(scannedBag('https://bo.example/colisage/CMD-12')).toBeNull();
    expect(scannedBag('https://bo.example/retrait/abcdefgh12')).toBeNull();
    expect(scannedBag('ABC23')).toBeNull();
    expect(scannedBag('ABCU34')).toBeNull();
    expect(scannedBag('   ')).toBeNull();
  });
});

describe('normalisedCode', () => {
  it('lit O comme 0, I et L comme 1 (règle de Crockford)', () => {
    expect(normalisedCode('oil 234')).toBe('011234');
  });
});

describe('bagUrl', () => {
  it('pose l’adresse absolue du sac, sans double barre', () => {
    expect(bagUrl('https://bo.example/', 'b 1')).toBe('https://bo.example/livraison/sac/b%201');
  });
});

describe('bagIndexLabel', () => {
  it('dit le rang, ou l’annulation', () => {
    expect(bagIndexLabel({ index: 2, total: 3 })).toBe('sac 2 / 3');
    expect(bagIndexLabel({ index: null, total: 3 })).toBe('sac annulé');
  });
});

describe('bagCountLabel', () => {
  it('compte les sacs chargés sur les sacs déclarés', () => {
    expect(bagCountLabel(stop({ state: 'partial', bags: [LOADED, WAITING] }))).toBe('1 sac sur 2');
    expect(
      bagCountLabel(stop({ state: 'loaded', bags: [LOADED, { ...LOADED, bagId: 'b-3' }] })),
    ).toBe('2 sacs sur 2');
  });

  it('🔴 dit « aucun sac déclaré » plutôt que « 0 sur 0 » (L4-C17)', () => {
    expect(bagCountLabel(stop({ state: 'unlabelled' }))).toBe('aucun sac déclaré');
  });
});

describe('stopStateLabel', () => {
  it('met l’arrêt sans sac en rouge', () => {
    expect(stopStateLabel('unlabelled').variant).toBe('alert');
    expect(stopStateLabel('partial').variant).toBe('warning');
    expect(stopStateLabel('loaded').variant).toBe('success');
  });
});

describe('missingStops', () => {
  it('liste ce qui n’est pas chargé, sans étiquette comprise, dans l’ordre servi', () => {
    const missing = missingStops({
      stops: [
        stop({ stopId: 's-1', reference: 'CMD-1', state: 'loaded', bags: [LOADED] }),
        stop({ stopId: 's-2', reference: 'CMD-2', state: 'unlabelled' }),
        stop({ stopId: 's-3', reference: 'CMD-3', state: 'partial', bags: [LOADED, WAITING] }),
      ],
    });
    expect(missing.map((line) => [line.reference, line.detail])).toEqual([
      ['CMD-2', 'aucun sac déclaré'],
      ['CMD-3', '1 sac sur 2'],
    ]);
  });
});

describe('parisTimeOf', () => {
  it('dit l’heure de Paris', () => {
    expect(parisTimeOf('2026-09-29T05:42:00.000Z')).toBe('7 h 42');
  });
});
