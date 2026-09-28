import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { groupOf } from '../handover-slots';
import type { HandoverBoard, SlotRow } from '../handover-slots';
import { HandoverBand } from './handover-band';

function row(reference: string, overrides: Partial<SlotRow> = {}): SlotRow {
  return {
    orderId: `o-${reference}`,
    reference,
    customerLabel: reference,
    state: 'ready',
    time: null,
    totalUnits: 1,
    pickupLabel: 'Le Labo',
    handedOverAt: null,
    readyAt: null,
    overdueMinutes: null,
    overdueCause: null,
    method: 'pickup',
    heldForQuality: false,
    ...overrides,
  };
}

const BOARD: HandoverBoard = {
  pickup: [groupOf('h07', [row('A'), row('B', { pickupLabel: 'Centre' })])],
  delivery: [groupOf('h08', [row('L', { method: 'delivery', pickupLabel: null })])],
  pickupExpected: 2,
  deliveryExpected: 1,
  overdue: 0,
  overdueKitchen: 0,
  awaitingPacking: 0,
  held: 0,
};

async function mount() {
  const fixture = TestBed.createComponent(HandoverBand);
  fixture.componentRef.setInput('board', BOARD);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

describe('HandoverBand', () => {
  it('compte chaque métier sur son onglet, et écrit le choix dans `method`', async () => {
    const fixture = await mount();
    const element: HTMLElement = fixture.nativeElement;
    const tabs = [...element.querySelectorAll<HTMLElement>('[role="tab"]')];
    expect(tabs.map((tab) => tab.textContent?.replace(/\s+/gu, ''))).toEqual([
      'Retrait2',
      'Livraison1',
    ]);

    tabs[1]?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.method()).toBe('delivery');
  });

  it('ne propose le filtre par point que sur le Retrait', async () => {
    const fixture = await mount();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('fold-listbox')).not.toBeNull();

    fixture.componentInstance.method.set('delivery');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(element.querySelector('fold-listbox')).toBeNull();
  });
});
