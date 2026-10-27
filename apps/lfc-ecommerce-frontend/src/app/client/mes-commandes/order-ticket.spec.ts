import type { CustomerOrderLineView, CustomerOrderView } from '@lfd/contracts';

import { FR } from '../copy/fr';
import { LIVE_PICKUP } from './order-view.fixture';
import { ticketOf } from './order-ticket';
import { ticketRowsOf } from './order-ticket-rows';

/**
 * Le ticket d'une commande de particulier composée en TTC (plan du centime,
 * lot C3) : tout est lu sur la commande, et la colonne tombe sur le total.
 */

const BANANA: CustomerOrderLineView = {
  sku: 'BAN-001',
  productName: 'Banana bread',
  unitPriceMillicents: 1_990_521,
  vatRate: 5.5,
  quantity: 1,
  lineTotalCents: 1_990,
  pricing: null,
  allergens: null,
};

function exact(over: Partial<CustomerOrderView> = {}): CustomerOrderView {
  return {
    ...LIVE_PICKUP,
    lines: [
      { ...BANANA, quantity: 1, unitPriceTtcCents: 2_100, lineTotalTtcCents: 2_100 },
      {
        ...BANANA,
        productName: 'Jus',
        vatRate: 20,
        quantity: 2,
        unitPriceTtcCents: 300,
        lineTotalTtcCents: 600,
      },
    ],
    ttcTerms: { discountCents: 270, voucherCents: 0, deliveryFeeCents: 0 },
    ttcByRate: [
      { rate: 5.5, htCents: 1_791, vatCents: 99, ttcCents: 1_890 },
      { rate: 20, htCents: 450, vatCents: 90, ttcCents: 540 },
    ],
    totalCents: 2_430,
    ...over,
  };
}

describe('ticketOf', () => {
  it('régression : Σ lignes TTC − remises + port = total affiché', () => {
    const ticket = ticketOf(exact());

    expect(ticket).not.toBeNull();
    expect(
      (ticket?.articlesCents ?? 0) -
        (ticket?.discountCents ?? 0) -
        (ticket?.voucherCents ?? 0) +
        (ticket?.deliveryFeeCents ?? 0),
    ).toBe(ticket?.totalCents);
  });

  it('le récapitulatif par taux somme vers le total, et HT + TVA = TTC', () => {
    const parts = ticketOf(exact())?.byRate ?? [];

    expect(parts.reduce((sum, part) => sum + part.ttcCents, 0)).toBe(2_430);
    expect(parts.every((part) => part.htCents + part.vatCents === part.ttcCents)).toBe(true);
  });

  it('un pro (sans TTC figés) n’a pas de ticket', () => {
    expect(ticketOf(LIVE_PICKUP)).toBeNull();
  });

  it('une commande d’avant la part par taux n’a pas de ticket', () => {
    const { ttcByRate: _ignored, ...older } = exact();
    expect(ticketOf(older)).toBeNull();
  });
});

describe('ticketRowsOf', () => {
  it('écrit les lignes, la remise signée, le total et chaque taux', () => {
    const ticket = ticketOf(exact());
    const rows = ticket === null ? [] : ticketRowsOf(ticket, FR.orders);
    const text = rows.map((row) => `${row.label}=${row.value}`).join('\n');

    expect(text).toContain(`${FR.orders.ticketArticles}=27,00`);
    expect(text).toContain(`${FR.orders.detailPickupDiscount}=−2,70`);
    expect(text).toContain(`${FR.orders.ticketTotal}=24,30`);
    expect(text).toMatch(/5,5 %=HT 17,91.*TVA 0,99.*TTC 18,90/u);
  });
});
