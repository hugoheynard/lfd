import type { AdminOrderRow, OrderOrigin, OrderStatus, PaymentStatus } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { orderMix, orderMixTotals } from '../stats/order-mix';
import { grainBuckets } from '../../shared/stats-grain/stats-grain';

const TODAY = new Date(2026, 7, 15, 10, 0, 0);

interface OrderShape {
  readonly placedAt: string;
  readonly totalCents: number;
  readonly paymentStatus?: PaymentStatus;
  readonly origin?: OrderOrigin;
  readonly status?: OrderStatus;
}

function order(shape: OrderShape): AdminOrderRow {
  return {
    id: `ord_${shape.placedAt}_${shape.totalCents}`,
    orderNumber: 'C-0001',
    placedAt: shape.placedAt,
    status: shape.status ?? 'placed',
    paymentStatus: shape.paymentStatus ?? 'paid',
    fulfillmentMethod: 'pickup',
    subtotalCents: shape.totalCents,
    vatCents: 0,
    totalCents: shape.totalCents,
    customerLabel: 'Café des Halles',
    companyId: 'cmp_1',
    origin: shape.origin ?? 'self_service',
  };
}

describe('le mix commandé d’un compte', () => {
  it('rend une période par pas de la fenêtre, la plus ancienne en tête', () => {
    const mix = orderMix([], grainBuckets('month', TODAY));

    expect(mix).toHaveLength(12);
    expect(mix.at(0)?.key).toBe('month-2025-09-01');
    expect(mix.at(-1)?.key).toBe('month-2026-08-01');
  });

  it('rend une période sans commande à zéro plutôt que de l’omettre', () => {
    // Un client qui a sauté un mois doit creuser un trou : une série qui
    // n'aurait que les mois servis mentirait sur le rythme.
    const mix = orderMix(
      [order({ placedAt: '2026-08-03T09:00:00', totalCents: 5000 })],
      grainBuckets('month', TODAY),
    );

    expect(mix.map((bucket) => bucket.totalCents).slice(-3)).toEqual([0, 0, 5000]);
  });

  it('croise le régime et l’origine sans compter deux fois', () => {
    // Une commande récurrente portée au compte est UNE commande : elle tombe
    // dans une seule des quatre cases, et le total reste la somme des quatre.
    const mix = orderMix(
      [
        order({
          placedAt: '2026-08-03T09:00:00',
          totalCents: 5000,
          paymentStatus: 'not_required',
          origin: 'recurring',
        }),
        order({ placedAt: '2026-08-04T09:00:00', totalCents: 1000, paymentStatus: 'not_required' }),
        order({ placedAt: '2026-08-05T09:00:00', totalCents: 300, origin: 'recurring' }),
        order({ placedAt: '2026-08-06T09:00:00', totalCents: 200 }),
      ],
      grainBuckets('month', TODAY),
    );
    const august = mix.at(-1);

    expect(august?.accountRecurringCents).toBe(5000);
    expect(august?.accountOneOffCents).toBe(1000);
    expect(august?.perOrderRecurringCents).toBe(300);
    expect(august?.perOrderOneOffCents).toBe(200);
    expect(august?.totalCents).toBe(6500);
    expect(august?.recurringCents).toBe(5300);
    expect(august?.ordersCount).toBe(4);
  });

  it('exclut les commandes annulées — elles n’ont rien encaissé', () => {
    const mix = orderMix(
      [
        order({ placedAt: '2026-08-03T09:00:00', totalCents: 5000, status: 'cancelled' }),
        order({ placedAt: '2026-08-04T09:00:00', totalCents: 1000 }),
      ],
      grainBuckets('month', TODAY),
    );
    const total = orderMixTotals(mix);

    expect(total.totalCents).toBe(1000);
    expect(total.ordersCount).toBe(1);
  });

  it('ignore ce qui précède la fenêtre', () => {
    const mix = orderMix(
      [order({ placedAt: '2024-01-05T09:00:00', totalCents: 9999 })],
      grainBuckets('month', TODAY),
    );

    expect(orderMixTotals(mix).totalCents).toBe(0);
  });

  it('cumule la fenêtre par régime', () => {
    const mix = orderMix(
      [
        order({ placedAt: '2026-08-03T09:00:00', totalCents: 5000, paymentStatus: 'not_required' }),
        order({ placedAt: '2026-07-03T09:00:00', totalCents: 2000 }),
      ],
      grainBuckets('month', TODAY),
    );

    expect(orderMixTotals(mix)).toMatchObject({
      totalCents: 7000,
      accountCents: 5000,
      perOrderCents: 2000,
      ordersCount: 2,
    });
  });
});
