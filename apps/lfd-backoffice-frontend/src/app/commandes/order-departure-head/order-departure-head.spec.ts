import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  AdminBackorderView,
  AdminOrderShortfall,
  AdminOrderShortfallDecision,
} from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { OrderDepartureHead } from './order-departure-head';

/** Des dates seulement affichées : aucune n'est comparée à l'horloge. */
const OLD_DECISION: AdminOrderShortfallDecision = {
  decidedAt: '2026-11-24T06:00:00.000Z',
  remainder: 'abandoned',
  customerNotice: null,
};
const DECISION: AdminOrderShortfallDecision = {
  ...OLD_DECISION,
  decidedByName: 'Claire Martin',
  departing: [
    { sku: 'CRO', quantity: 1, saleUnit: 'piece' },
    { sku: 'PAI', quantity: 2, saleUnit: 'piece' },
  ],
};
const DECIDED: AdminOrderShortfall = {
  reportedAt: '2026-11-24T05:00:00.000Z',
  lines: [
    { sku: 'CRO', due: 3, packed: 1, saleUnit: 'piece' },
    { sku: 'PAI', due: 2, packed: 2, saleUnit: 'piece' },
  ],
  decision: DECISION,
};

const LINES = [
  { sku: 'CRO', productName: 'Croissant' },
  { sku: 'PAI', productName: 'Baguette' },
];

const BACKORDER: AdminBackorderView = {
  id: 'bo_1',
  state: 'converted',
  createdAt: '2026-11-24T06:00:00.000Z',
  origin: { orderId: 'ord_13', orderNumber: 'ORD-13' },
  company: null,
  buyer: { userId: 'usr_1', name: 'Paul Durand' },
  lines: [],
  convertedOrder: { orderId: 'ord_14', orderNumber: 'ORD-14' },
  closedAt: '2026-11-24T08:00:00.000Z',
};

function mount(shortfall: AdminOrderShortfall | null, backorder: AdminBackorderView | null = null) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(OrderDepartureHead);
  fixture.componentRef.setInput('shortfall', shortfall);
  fixture.componentRef.setInput('lines', LINES);
  fixture.componentRef.setInput('backorder', backorder);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const text = (el: Element | null): string => (el?.textContent ?? '').replace(/\s+/gu, ' ');

describe('OrderDepartureHead — la décision du départ, en tête', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('ne dit rien sans manque, ni avant la décision', () => {
    expect(mount(null).querySelector('[data-departure-head]')).toBeNull();
    TestBed.resetTestingModule();
    expect(mount({ ...DECIDED, decision: null }).querySelector('[data-departure-head]')).toBeNull();
  });

  it('dit qui a décidé, ce qui est parti, et le reste abandonné', () => {
    const el = mount(DECIDED);
    expect(text(el.querySelector('[data-departure-by]'))).toContain('par Claire Martin');
    expect(text(el.querySelector('[data-departure-departed]'))).toContain(
      'Parti : 1 Croissant, 2 Baguette.',
    );
    expect(text(el.querySelector('[data-abandoned-remainder]'))).toContain(
      'Reste abandonné : 2 Croissant',
    );
    expect(text(el.querySelector('[data-departure-pending]'))).toContain(
      'Le reste devient un reliquat à traiter',
    );
  });

  it('une fiche sortie de l’annuaire se dit introuvable ; un serveur muet ne dit personne', () => {
    const gone = mount({ ...DECIDED, decision: { ...DECISION, decidedByName: null } });
    expect(text(gone.querySelector('[data-departure-by]'))).toContain('par une fiche introuvable');
    TestBed.resetTestingModule();
    const silent = mount({ ...DECIDED, decision: OLD_DECISION });
    expect(silent.querySelector('[data-departure-by]')).toBeNull();
    expect(silent.querySelector('[data-departure-departed]')).toBeNull();
  });

  it('mène au reliquat devenu commande', () => {
    const el = mount(DECIDED, BACKORDER);
    const link = el.querySelector('a[data-departure-backorder]');
    expect(link?.textContent).toContain('ORD-14');
    expect(link?.getAttribute('href')).toBe('/commandes/ord_14');
    expect(el.querySelector('[data-departure-pending]')).toBeNull();
  });

  it('mène à la liste des reliquats tant qu’il est à traiter', () => {
    const el = mount(DECIDED, {
      ...BACKORDER,
      state: 'open',
      convertedOrder: null,
      closedAt: null,
    });
    expect(el.querySelector('a[data-departure-backorder]')?.getAttribute('href')).toBe(
      '/reliquats',
    );
  });
});
