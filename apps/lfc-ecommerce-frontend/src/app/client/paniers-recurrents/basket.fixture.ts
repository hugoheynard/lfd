import type { RecurringOccurrenceView, SubscriptionView } from '@lfd/contracts';

/** Le jour de Paris que les specs tiennent pour « aujourd'hui ». */
export const TODAY = '2026-12-10';

export function occurrence(
  serviceDay: string,
  state: RecurringOccurrenceView['state'],
  extra: Partial<RecurringOccurrenceView> = {},
): RecurringOccurrenceView {
  return {
    serviceDay,
    state,
    lines: [{ sku: 'PAIN-01', quantity: 4 }],
    overridden: false,
    note: '',
    orderId: null,
    ...extra,
  };
}

/** Un panier hebdomadaire de société, en retrait, avec une échéance de chaque sorte. */
export const BASKET: SubscriptionView = {
  id: 'sub_1',
  recurrence: 'weekly',
  status: 'active',
  startDate: '2026-11-05',
  endDate: null,
  fulfillmentMethod: 'pickup',
  deliveryAddress: null,
  pickupAddressId: null,
  requestedWindow: { start: '07:00', end: '08:00' },
  note: '',
  lines: [
    { sku: 'PAIN-01', quantity: 4 },
    { sku: 'CROI-02', quantity: 12 },
  ],
  salesTerms: { document: 'salesTermsPro', revision: 3 },
  nextSalesTerms: null,
  occurrences: [
    occurrence('2026-11-26', 'placed', { orderId: 'ord_past' }),
    occurrence('2026-12-03', 'missed'),
    occurrence('2026-12-04', 'cancelled'),
    occurrence('2026-12-17', 'planned'),
    occurrence('2026-12-24', 'skipped'),
    occurrence('2026-12-31', 'planned', {
      overridden: true,
      lines: [{ sku: 'PAIN-01', quantity: 2 }],
    }),
  ],
  createdAt: '2026-11-01T10:00:00.000Z',
};
