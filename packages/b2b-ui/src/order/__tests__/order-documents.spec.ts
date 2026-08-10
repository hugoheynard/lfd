import type { OrderStatus, OrderView } from '@lfd/contracts';

import {
  ORDER_DOC_DELIVERY_NOTE,
  ORDER_DOC_INVOICE,
  deliveryNoteFileName,
  orderDocuments,
  renderDeliveryNote,
} from '../order-documents';

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
      { sku: 'VIE-001', productName: 'Croissant', quantity: 12, unitPriceCents: 200 },
      { sku: 'PAI-001', productName: 'Baguette tradition', quantity: 24, unitPriceCents: 200 },
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
    expect(
      docOf(order({ status: 'placed' }), ORDER_DOC_DELIVERY_NOTE)?.unavailable,
    ).toBeUndefined();
  });

  it('mais pas sur un brouillon ni sur une commande annulée', () => {
    const withDoc = (['draft', 'cancelled'] as const).filter(
      (status) => docOf(order({ status }), ORDER_DOC_DELIVERY_NOTE)?.unavailable === undefined,
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

describe('renderDeliveryNote', () => {
  it('porte les quantités et les références', () => {
    const note = renderDeliveryNote(order());

    expect(note).toContain('12 × Croissant (VIE-001)');
    expect(note).toContain('24 × Baguette tradition (PAI-001)');
  });

  it('totalise les unités — ce qu’on compte à la réception', () => {
    expect(renderDeliveryNote(order())).toContain('Total articles : 36');
  });

  it('ne porte AUCUN montant : le document circule hors de l’entreprise cliente', () => {
    expect(renderDeliveryNote(order())).not.toMatch(/€|\bHT\b|\bTTC\b/u);
  });

  it('rend l’adresse de retrait en retrait, celle du coursier en livraison', () => {
    const pickup = renderDeliveryNote(
      order({
        fulfillmentMethod: 'pickup',
        pickupAddress: {
          ligne1: 'Labo Chambéry',
          ligne2: '',
          codePostal: '73000',
          ville: 'Chambéry',
        } as OrderView['pickupAddress'],
        deliveryAddress: {
          ligne1: 'NE DOIT PAS APPARAÎTRE',
          ligne2: '',
          codePostal: '00000',
          ville: 'Nulle part',
        } as OrderView['deliveryAddress'],
      }),
    );

    expect(pickup).toContain('Labo Chambéry');
    expect(pickup).not.toContain('NE DOIT PAS APPARAÎTRE');
  });

  it('saute la deuxième ligne d’adresse quand elle est vide', () => {
    const note = renderDeliveryNote(
      order({
        pickupAddress: {
          ligne1: 'Labo',
          ligne2: '',
          codePostal: '73000',
          ville: 'Chambéry',
        } as OrderView['pickupAddress'],
      }),
    );

    expect(note.split('\n').filter((line) => line.trim() === '' && line.length > 0)).toEqual([]);
  });

  it('reporte la note du client quand il y en a une', () => {
    expect(renderDeliveryNote(order({ note: 'Sonner au 2e' }))).toContain('Note : Sonner au 2e');
  });

  it('n’écrit pas de ligne « Note » vide', () => {
    expect(renderDeliveryNote(order({ note: '' }))).not.toContain('Note :');
  });
});

describe('deliveryNoteFileName', () => {
  it('porte le numéro de commande — un dossier de bons doit rester triable', () => {
    expect(deliveryNoteFileName(order({ orderNumber: 'ORD-XYZ' }))).toBe(
      'bon-de-livraison-ORD-XYZ.txt',
    );
  });
});
