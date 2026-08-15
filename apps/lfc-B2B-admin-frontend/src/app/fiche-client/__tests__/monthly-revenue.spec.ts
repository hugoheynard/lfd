import type { AdminOrderRow, OrderStatus } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { monthlyRevenue } from '../stats/monthly-revenue';

const TODAY = new Date('2026-08-15T10:00:00');

function order(
  placedAt: string,
  totalCents: number,
  status: OrderStatus = 'placed',
): AdminOrderRow {
  return {
    id: `ord_${placedAt}_${totalCents}`,
    orderNumber: 'C-0001',
    placedAt,
    status,
    paymentStatus: 'paid',
    fulfillmentMethod: 'pickup',
    totalCents,
    customerLabel: 'Café des Halles',
    companyId: 'cmp_1',
    origin: 'self_service',
  };
}

describe('le chiffre mensuel d’un compte', () => {
  it('rend un mois par pas de la fenêtre, le plus ancien en tête', () => {
    const months = monthlyRevenue([], 3, TODAY);

    expect(months.map((month) => month.month)).toEqual(['2026-06', '2026-07', '2026-08']);
  });

  it('rend un mois sans commande à zéro plutôt que de l’omettre', () => {
    // Un client qui a sauté un mois doit creuser un trou dans la courbe : une
    // série qui n'aurait que les mois servis mentirait sur le rythme.
    const months = monthlyRevenue([order('2026-08-03T09:00:00Z', 5000)], 3, TODAY);

    expect(months.map((month) => month.totalCents)).toEqual([0, 0, 5000]);
  });

  it('somme les commandes du même mois', () => {
    const months = monthlyRevenue(
      [order('2026-08-03T09:00:00Z', 5000), order('2026-08-20T09:00:00Z', 2500)],
      1,
      TODAY,
    );

    expect(months[0]?.totalCents).toBe(7500);
    expect(months[0]?.ordersCount).toBe(2);
  });

  it('exclut les commandes annulées — elles n’ont rien encaissé', () => {
    const months = monthlyRevenue(
      [order('2026-08-03T09:00:00Z', 5000, 'cancelled'), order('2026-08-04T09:00:00Z', 1000)],
      1,
      TODAY,
    );

    expect(months[0]?.totalCents).toBe(1000);
    expect(months[0]?.ordersCount).toBe(1);
  });

  it('ignore ce qui précède la fenêtre', () => {
    const months = monthlyRevenue([order('2025-01-05T09:00:00Z', 9999)], 3, TODAY);

    expect(months.every((month) => month.totalCents === 0)).toBe(true);
  });
});
