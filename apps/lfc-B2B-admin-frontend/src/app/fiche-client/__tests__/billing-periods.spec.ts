import type { AdminOrderRow, OrderStatus, PaymentStatus } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { periodDueDate, splitForBilling } from '../facturation/billing-periods';

const NOW = new Date('2026-08-15T10:00:00');

function order(
  placedAt: string,
  totalCents: number,
  paymentStatus: PaymentStatus,
  status: OrderStatus = 'fulfilled',
): AdminOrderRow {
  return {
    id: `ord_${placedAt}_${totalCents}`,
    orderNumber: `C-${totalCents}`,
    placedAt,
    status,
    paymentStatus,
    fulfillmentMethod: 'pickup',
    totalCents,
    customerLabel: 'Café des Halles',
    companyId: 'cmp_1',
    origin: 'self_service',
  };
}

describe('le partage facturation d’un compte', () => {
  it('range au compte ce qui est en not_required, et à la commande tout le reste', () => {
    // `not_required` EST la marque du terme différé : c'est ce statut, et lui
    // seul, qui distingue les deux colonnes.
    const split = splitForBilling(
      [
        order('2026-08-03T09:00:00Z', 5000, 'not_required'),
        order('2026-08-04T09:00:00Z', 2000, 'paid'),
        order('2026-08-05T09:00:00Z', 1000, 'pending'),
      ],
      NOW,
    );

    expect(split.periods).toHaveLength(1);
    expect(split.periods[0]?.totalCents).toBe(5000);
    expect(split.perOrder.map((row) => row.totalCents)).toEqual([1000, 2000]);
  });

  it('marque la période du mois courant comme ouverte, et elle seule', () => {
    const split = splitForBilling(
      [
        order('2026-08-03T09:00:00Z', 5000, 'not_required'),
        order('2026-07-03T09:00:00Z', 3000, 'not_required'),
      ],
      NOW,
    );

    expect(split.periods.map((period) => period.open)).toEqual([true, false]);
    expect(split.openTotalCents).toBe(5000);
    expect(split.closedTotalCents).toBe(3000);
  });

  it('exclut les commandes annulées des deux colonnes', () => {
    // Les laisser gonflerait un total que le commercial annoncerait au téléphone.
    const split = splitForBilling(
      [
        order('2026-08-03T09:00:00Z', 5000, 'not_required', 'cancelled'),
        order('2026-08-04T09:00:00Z', 2000, 'paid', 'cancelled'),
      ],
      NOW,
    );

    expect(split.periods).toEqual([]);
    expect(split.perOrder).toEqual([]);
  });

  it('range les périodes de la plus récente à la plus ancienne', () => {
    const split = splitForBilling(
      [
        order('2026-06-03T09:00:00Z', 100, 'not_required'),
        order('2026-08-03T09:00:00Z', 200, 'not_required'),
        order('2026-07-03T09:00:00Z', 300, 'not_required'),
      ],
      NOW,
    );

    expect(split.periods.map((period) => period.key)).toEqual(['2026-08', '2026-07', '2026-06']);
  });

  it('n’invente pas les mois sans commande', () => {
    // Contrairement à la courbe des stats, où un trou est l'information : sur un
    // relevé, un mois vide n'est pas un fait, c'est un mois sans rien à facturer.
    const split = splitForBilling([order('2026-06-03T09:00:00Z', 100, 'not_required')], NOW);

    expect(split.periods.map((period) => period.key)).toEqual(['2026-06']);
  });

  it('échoit au 1er du mois suivant', () => {
    expect(periodDueDate('2026-08')).toBe('2026-09-01');
    expect(periodDueDate('2026-12')).toBe('2027-01-01');
  });
});
