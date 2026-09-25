import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import type { HandoverBoard, SlotRow } from '../handover-slots';
import { HandoverColumn } from './handover-column';

function row(reference: string, overrides: Partial<SlotRow> = {}): SlotRow {
  return {
    orderId: `o-${reference}`,
    reference,
    customerLabel: reference,
    state: 'ready',
    time: '7 h 15',
    totalUnits: 3,
    pickupLabel: 'Boutique',
    handedOverAt: null,
    overdueMinutes: null,
    method: 'pickup',
    ...overrides,
  };
}

const BOARD: HandoverBoard = {
  pickup: [
    {
      key: 'h07',
      kind: 'hour',
      label: '7 h – 8 h',
      expected: 3,
      handedOver: 1,
      rows: [
        row('PRETE'),
        row('RETIREE', { state: 'handed_over', handedOverAt: '7 h 04' }),
        row('TARD', { state: 'overdue', overdueMinutes: 55 }),
      ],
    },
  ],
  delivery: [
    {
      key: 'h08',
      kind: 'hour',
      label: '8 h – 9 h',
      expected: 1,
      handedOver: 0,
      rows: [row('LIV', { method: 'delivery' })],
    },
  ],
  pickupExpected: 2,
  deliveryExpected: 1,
  overdue: 1,
};

async function mount(board: HandoverBoard) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(HandoverColumn);
  fixture.componentRef.setInput('board', board);
  fixture.componentRef.setInput('showLinks', true);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

describe('HandoverColumn', () => {
  it('groupe par tranche et dit chaque état en toutes lettres', async () => {
    const fixture = await mount(BOARD);
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector('[data-slot="h07"]')?.textContent).toContain(
      '3 attendues · 1 retirée',
    );
    expect(element.querySelector('[data-reference="RETIREE"]')?.textContent).toContain(
      'Retirée à 7 h 04',
    );
    expect(element.querySelector('[data-reference="TARD"]')?.textContent).toContain(
      'créneau dépassé de 55 min',
    );
  });

  it('renvoie vers le retrait là où la maquette posait « Remettre »', async () => {
    const fixture = await mount(BOARD);
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector('[data-reference="PRETE"] a')?.getAttribute('href')).toBe(
      '/comptoir/retrait',
    );
    expect(element.querySelector('[data-reference="RETIREE"] a')).toBeNull();
  });

  it('lit l’acheminement choisi par la page', async () => {
    const fixture = await mount(BOARD);
    fixture.componentRef.setInput('method', 'delivery');
    fixture.detectChanges();
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector('[data-reference="LIV"]')).not.toBeNull();
    expect(element.querySelector('[data-reference="PRETE"]')).toBeNull();
    expect(element.querySelector('fold-view-toggle')).toBeNull();
  });
});
