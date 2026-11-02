import type { PickupSlot, ResupplyReceiptLineView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { currentSlotOf, shelfHintOf, shelfShortageOf, shelfStockBySku } from '../immediate-pickup';

/** Lot L6 (plan du jour J) : ce que le « Retrait immédiat » dérive. */

function slot(start: string, end: string): PickupSlot {
  return { id: `${start}-${end}`, start, end, access: 'public' };
}

const SLOTS = [slot('07:00', '08:00'), slot('08:00', '09:00'), slot('10:00', '11:00')];

function line(
  sku: string,
  saleUnit: 'piece' | 'weight',
  estimatedStock: number,
): ResupplyReceiptLineView {
  return { sku, label: sku, saleUnit, receivedQuantity: estimatedStock, estimatedStock };
}

describe('currentSlotOf', () => {
  it('prend le créneau qui contient l’heure', () => {
    expect(currentSlotOf(SLOTS, '08:15')?.id).toBe('08:00-09:00');
  });

  it('prend le prochain dans un trou de l’ouverture', () => {
    expect(currentSlotOf(SLOTS, '09:30')?.id).toBe('10:00-11:00');
  });

  it('prend le dernier après la fermeture, et rien sans heure déclarée', () => {
    expect(currentSlotOf(SLOTS, '18:00')?.id).toBe('10:00-11:00');
    expect(currentSlotOf([], '08:00')).toBeNull();
  });
});

describe('shelfStockBySku', () => {
  it('ne garde que les restes positifs, dans l’unité de vente du catalogue', () => {
    const left = shelfStockBySku(
      [
        line('PAIN', 'piece', 3),
        line('TOME', 'weight', 1250),
        line('TOME', 'piece', 2),
        line('VIDE', 'piece', 0),
      ],
      [{ sku: 'PAIN' }, { sku: 'TOME', saleUnit: 'weight' }, { sku: 'VIDE' }],
    );
    expect([...left]).toEqual([
      ['PAIN', 3],
      ['TOME', 1250],
    ]);
  });
});

describe('shelfShortageOf', () => {
  const left = new Map([['PAIN', 3]]);

  it('ne dit rien quand la vitrine couvre le panier', () => {
    expect(shelfShortageOf([{ sku: 'PAIN', name: 'Pain', quantity: 3 }], left)).toBeNull();
  });

  it('nomme ce qui dépasse le reste ou n’y est pas', () => {
    expect(
      shelfShortageOf(
        [
          { sku: 'PAIN', name: 'Pain', quantity: 4 },
          { sku: 'TARTE', name: 'Tarte', quantity: 1 },
        ],
        left,
      ),
    ).toBe('Pas assez en vitrine pour : Pain, Tarte.');
  });
});

describe('shelfHintOf', () => {
  it('dit le reste en pièces, ou au poids', () => {
    expect(shelfHintOf(3, 'piece')).toBe('reste 3');
    expect(shelfHintOf(1250, 'weight')).toContain('kg');
  });
});
