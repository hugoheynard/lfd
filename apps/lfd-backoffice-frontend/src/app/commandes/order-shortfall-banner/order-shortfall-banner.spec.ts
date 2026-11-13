import { TestBed } from '@angular/core/testing';
import type { AdminOrderShortfall, SettlementRegime } from '@lfd/contracts';
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

function mount(
  shortfall: AdminOrderShortfall | null,
  settlement: SettlementRegime | null = null,
  increasePending = false,
): HTMLElement {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(OrderShortfallBanner);
  fixture.componentRef.setInput('shortfall', shortfall);
  fixture.componentRef.setInput('lines', LINES);
  fixture.componentRef.setInput('settlement', settlement);
  fixture.componentRef.setInput('increasePending', increasePending);
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

describe('le bandeau du manque d’une commande réglée par carte (plan E9)', () => {
  const terms = (settlement: SettlementRegime | null, increasePending = false): string =>
    said(
      mount(SHORTFALL, settlement, increasePending).querySelector('[data-shortfall-card-terms]'),
    );

  it('carte pas encore encaissée : la décision attend le paiement', () => {
    expect(terms('due')).toBe('Carte pas encore encaissée : la décision attend le paiement.');
  });

  it('hausse par carte vivante : la décision attend qu’elle soit réglée', () => {
    expect(terms('paid', true)).toBe(
      'Hausse par carte en cours : la décision attend qu’elle soit réglée.',
    );
  });

  it('carte encaissée : le reste abandonné sera remboursé au solde', () => {
    expect(terms('paid')).toBe('Carte encaissée : le reste abandonné sera remboursé au solde.');
  });

  it.each(['account', 'free', null] as const)('ne parle pas de carte pour %s', (settlement) => {
    expect(mount(SHORTFALL, settlement).querySelector('[data-shortfall-card-terms]')).toBeNull();
  });
});
