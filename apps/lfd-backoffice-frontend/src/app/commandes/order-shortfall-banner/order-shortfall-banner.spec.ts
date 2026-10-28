import { TestBed } from '@angular/core/testing';
import type { AdminOrderShortfall } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { OrderShortfallBanner } from './order-shortfall-banner';

/** Recopié à l'écran, jamais comparé à l'horloge. */
const SHORTFALL: AdminOrderShortfall = {
  reportedAt: '2030-01-10T05:30:00.000Z',
  lines: [
    { sku: 'CRO', due: 12, packed: 9, saleUnit: 'piece' },
    { sku: 'PAC', due: 6, packed: 6, saleUnit: 'piece' },
  ],
  decision: null,
};

const LINES = [
  { sku: 'CRO', productName: 'Croissant' },
  { sku: 'PAC', productName: 'Pain au chocolat' },
];

function mount(shortfall: AdminOrderShortfall | null): HTMLElement {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(OrderShortfallBanner);
  fixture.componentRef.setInput('shortfall', shortfall);
  fixture.componentRef.setInput('lines', LINES);
  fixture.detectChanges();
  return fixture.nativeElement;
}

function said(element: Element | null): string {
  return (element?.textContent ?? '').replace(/\s+/gu, ' ').trim();
}

describe('le bandeau du manque signalé (E6a)', () => {
  it('ne dit rien sans manque en vigueur', () => {
    expect(mount(null).querySelector('[data-shortfall-banner]')).toBeNull();
  });

  it('dit « décision attendue » et les seules lignes où il manque, nommées', () => {
    const text = said(mount(SHORTFALL).querySelector('[data-shortfall-banner]'));

    expect(text).toContain('Manque signalé — décision attendue.');
    expect(text).toContain('Croissant, 9 au bac sur 12.');
    expect(text).not.toContain('Pain au chocolat');
  });

  it('nomme par le SKU un article absent des lignes de la commande', () => {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(OrderShortfallBanner);
    fixture.componentRef.setInput('shortfall', SHORTFALL);
    fixture.componentRef.setInput('lines', []);
    fixture.detectChanges();

    expect(said(fixture.nativeElement.querySelector('[data-shortfall-banner]'))).toContain(
      'CRO, 9 au bac sur 12.',
    );
  });

  it('se tait une fois le départ décidé (E6b)', () => {
    const decided = {
      ...SHORTFALL,
      decision: {
        decidedAt: SHORTFALL.reportedAt,
        remainder: 'abandoned' as const,
        customerNotice: null,
      },
    };
    expect(mount(decided).querySelector('[data-shortfall-banner]')).toBeNull();
  });
});
