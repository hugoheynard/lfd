import { describe, expect, it } from 'vitest';

import { orderDocumentCustomer } from '../order-document-customer';
import { adminOrder } from './admin-order-fixture';

describe('orderDocumentCustomer', () => {
  const base = adminOrder();

  it('prend l’enseigne de la société quand elle en a une', () => {
    const order = adminOrder({
      placedBy: {
        ...base.placedBy,
        company: { id: 'cmp_1', raisonSociale: 'SAS Les Tommeuses', enseigne: 'Les Tommeuses' },
      },
    });
    expect(orderDocumentCustomer(order)).toBe('Les Tommeuses');
  });

  it('retombe sur la raison sociale sans enseigne', () => {
    expect(orderDocumentCustomer(base)).toBe('Boulangerie Martin SAS');
  });

  it('nomme la personne sur une commande personnelle', () => {
    const order = adminOrder({ placedBy: { ...base.placedBy, company: null } });
    expect(orderDocumentCustomer(order)).toBe('Paul Durand');
  });
});
