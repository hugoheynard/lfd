import { TestBed } from '@angular/core/testing';
import type { AdminOrderShortfall, AdminOrderView } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { adminOrder } from '../__tests__/admin-order-fixture';
import { OrderDeliveredAmounts } from './order-delivered-amounts';

const DECIDED: AdminOrderShortfall = {
  reportedAt: '2026-11-24T05:00:00.000Z',
  lines: [{ sku: 'CRO', due: 3, packed: 1, saleUnit: 'piece' }],
  decision: { decidedAt: '2026-11-24T06:00:00.000Z', remainder: 'abandoned', customerNotice: null },
};

const BILLABLE = {
  subtotalCents: 10_000,
  discountCents: 0,
  voucherDiscountCents: 0,
  deliveryFeeCents: 0,
  lateFeeCents: 0,
  vatCents: 550,
  totalCents: 10_550,
  settledOn: '2026-11-24',
};

function mount(order: AdminOrderView): HTMLElement {
  const fixture = TestBed.createComponent(OrderDeliveredAmounts);
  fixture.componentRef.setInput('order', order);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const said = (el: HTMLElement, selector: string): string =>
  (el.querySelector(selector)?.textContent ?? '').replace(/\s+/gu, ' ');

describe('OrderDeliveredAmounts — commandé et livré', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('ne dit rien sans décision du départ : une commande partie entière n’a qu’un montant', () => {
    expect(
      mount(adminOrder({ billable: BILLABLE })).querySelector('[data-delivered-amounts]'),
    ).toBeNull();
  });

  it('met le commandé à côté du livré facturable', () => {
    const el = mount(adminOrder({ shortfall: DECIDED, billable: BILLABLE }));
    expect(said(el, '[data-amount-ordered]')).toMatch(/208,19/u);
    expect(said(el, '[data-amount-delivered]')).toMatch(/105,50/u);
    expect(said(el, '[data-amount-delivered-pretax]')).toMatch(/100,00/u);
  });

  it('avant le solde, le livré le dit', () => {
    const el = mount(adminOrder({ shortfall: DECIDED, billable: null }));
    expect(said(el, '[data-amount-delivered]')).toContain('au solde');
    expect(said(el, '[data-amount-ordered]')).toMatch(/208,19/u);
  });
});
