import { TestBed } from '@angular/core/testing';
import { OrderDetail, OrderRow } from '@lfd/b2b-ui/order';
import type { AdminOrderRow, AdminOrderView, CustomerOrderView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { OrderMasthead } from '../order-masthead/order-masthead';
import { OrdersTable } from '../orders-table/orders-table';
import { adminOrder } from './admin-order-fixture';

/**
 * **Une commande interne ne montre aucun prix** (décidé par Hugo le
 * 2026-11-27) : les articles et leurs quantités, la mention « Commande
 * interne — sans facturation. », et rien de chiffré — ni colonne de prix, ni
 * total, ni montant d'en-tête, ni montant de liste.
 *
 * Le détail partagé est éprouvé ici : la suite jest de `@lfd/b2b-ui` tourne
 * sous Node, sans rendu Angular.
 */
const LINE = {
  sku: 'PAIN-LEV',
  productName: 'Pain au levain',
  unitPriceMillicents: 400_000,
  vatRate: 5.5,
  quantity: 2,
  saleUnit: 'piece',
  lineTotalCents: 800,
  unitPriceTtcCents: 422,
  lineTotalTtcCents: 844,
  pricing: null,
  allergens: null,
} as const;

function inHouse(overrides: Partial<AdminOrderView> = {}): AdminOrderView {
  return adminOrder({ settlement: 'in_house', lines: [LINE], ...overrides });
}

function detail(order: CustomerOrderView, framed: boolean): HTMLElement {
  const fixture = TestBed.createComponent(OrderDetail);
  fixture.componentRef.setInput('order', order);
  fixture.componentRef.setInput('framed', framed);
  fixture.componentRef.setInput('selectableLines', true);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const squash = (text: string | null | undefined): string =>
  (text ?? '').replace(/\s+/gu, ' ').trim();

describe('une commande interne — aucun prix à l’écran', () => {
  for (const framed of [true, false]) {
    it(`le détail (${framed ? 'back-office' : 'boutique'}) garde l’article et la quantité, tait tout montant`, () => {
      const el = detail(inHouse(), framed);
      const headers = [...el.querySelectorAll('thead th')].map((th) => squash(th.textContent));
      expect(headers).toEqual(['SKU', 'Qté', 'Article']);
      const cells = [...el.querySelectorAll('tbody td')].map((td) => squash(td.textContent));
      expect(cells[1]).toBe('2');
      expect(cells.join(' ')).toContain('Pain au levain');
      expect(el.textContent).not.toContain('€');
      expect(el.querySelector('[data-article-why]')).toBeNull();
      expect(el.querySelector('.od-totals')).toBeNull();
      expect(squash(el.querySelector('[data-in-house-mention]')?.textContent)).toBe(
        'Commande interne — sans facturation.',
      );
    });
  }

  it('une commande facturée garde ses prix et ses montants', () => {
    const el = detail(adminOrder({ lines: [LINE] }), true);
    expect([...el.querySelectorAll('thead th')].map((th) => squash(th.textContent))).toContain(
      'PU HT',
    );
    expect(el.querySelector('.od-totals')).not.toBeNull();
    expect(el.querySelector('[data-in-house-mention]')).toBeNull();
  });

  it('la bande de tête ne porte aucun montant, le badge dit le régime', () => {
    const fixture = TestBed.createComponent(OrderMasthead);
    fixture.componentRef.setInput('order', inHouse());
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-om-total]')).toBeNull();
    expect(squash(el.querySelector('[data-om-payment]')?.textContent)).toBe(
      'Commande interne — sans facturation',
    );
  });

  it('les listes disent « Interne » à la place du montant', () => {
    const row: AdminOrderRow = {
      id: 'o_1',
      orderNumber: 'CMD-1',
      placedAt: '2026-10-12T08:00:00.000Z',
      status: 'placed',
      offPlan: false,
      supply: 'planned',
      shortfallReportedAt: null,
      paymentStatus: 'not_required',
      settlement: 'in_house',
      fulfillmentMethod: 'delivery',
      fulfillmentDay: '2026-10-14',
      clientele: 'pro',
      siteId: null,
      pickupLabel: null,
      fulfillmentWindow: null,
      subtotalCents: 1000,
      vatCents: 55,
      totalCents: 0,
      customerLabel: 'Restaurant maison',
      companyId: 'cmp_1',
      companyDisplayName: null,
      origin: 'self_service',
      entryOrigin: null,
    };
    const rowFixture = TestBed.createComponent(OrderRow);
    rowFixture.componentRef.setInput('order', row);
    rowFixture.detectChanges();
    expect(
      squash((rowFixture.nativeElement as HTMLElement).querySelector('.row-total')?.textContent),
    ).toBe('Interne');

    const table = TestBed.createComponent(OrdersTable);
    table.componentRef.setInput('palette', []);
    table.componentRef.setInput('rows', [row]);
    table.componentRef.setInput('caption', 'Commandes');
    table.componentRef.setInput('empty', { title: 'Aucune commande' });
    table.componentRef.setInput('wide', false);
    table.detectChanges();
    expect(
      squash((table.nativeElement as HTMLElement).querySelector('.ot-total')?.textContent),
    ).toBe('Interne');
  });
});
