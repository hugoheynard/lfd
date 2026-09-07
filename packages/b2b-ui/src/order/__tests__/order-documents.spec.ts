import type { OrderStatus, OrderView } from '@lfd/contracts';

import { ORDER_DOC_ORDER_SHEET, ORDER_DOC_INVOICE, orderDocuments } from '../order-documents';

function order(overrides: Partial<OrderView> = {}): OrderView {
  return {
    orderNumber: 'ORD-1',
    status: 'placed',
    paymentStatus: 'paid',
    fulfillmentMethod: 'pickup',
    placedAt: '2026-08-06T09:00:00.000Z',
    requestedDeliveryDate: null,
    deliveryAddress: null,
    pickupAddress: null,
    note: '',
    lines: [
      { sku: 'VIE-001', productName: 'Croissant', quantity: 12, unitPriceMillicents: 200 },
      { sku: 'PAI-001', productName: 'Baguette tradition', quantity: 24, unitPriceMillicents: 200 },
    ],
    ...overrides,
  } as OrderView;
}

const docOf = (view: OrderView, key: string) => orderDocuments(view).find((doc) => doc.key === key);

describe('orderDocuments', () => {
  it('la facture est annoncée mais JAMAIS disponible — aucune numérotation n’existe', () => {
    const statuses: readonly OrderStatus[] = [
      'draft',
      'placed',
      'confirmed',
      'in_production',
      'fulfilled',
      'cancelled',
    ];

    const available = statuses.filter(
      (status) => docOf(order({ status }), ORDER_DOC_INVOICE)?.unavailable === undefined,
    );

    expect(available).toEqual([]);
  });

  it('le bon de livraison est disponible dès que la commande est passée', () => {
    expect(docOf(order({ status: 'placed' }), ORDER_DOC_ORDER_SHEET)?.unavailable).toBeUndefined();
  });

  it('mais pas sur un brouillon ni sur une commande annulée', () => {
    const withDoc = (['draft', 'cancelled'] as const).filter(
      (status) => docOf(order({ status }), ORDER_DOC_ORDER_SHEET)?.unavailable === undefined,
    );

    expect(withDoc).toEqual([]);
  });

  it('un document indisponible dit toujours POURQUOI', () => {
    const mute = orderDocuments(order({ status: 'draft' })).filter(
      (doc) => doc.unavailable !== undefined && doc.unavailable.trim() === '',
    );

    expect(mute).toEqual([]);
  });
});
