import type { CompanyMemberView, CounterCustomerView, DeliveryAddressView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  customerFromAdminCompany,
  customerFromCounter,
  type AdminCompanyFacts,
} from '../order-entry-customer';

const ADDRESS: DeliveryAddressView = {
  id: 'a1',
  label: 'Boutique',
  ligne1: '1 rue du Four',
  ligne2: '',
  codePostal: '69001',
  ville: 'Lyon',
  pays: 'FR',
  isDefault: true,
  specs: {
    note: '',
    slots: { mode: 'everyday', slot: null },
    deliveryContact: null,
    gps: null,
    signatureRequired: false,
  },
  procedureStepCount: 0,
};

const MEMBER: CompanyMemberView = {
  userId: 'u1',
  email: 'a@b.fr',
  firstName: 'Anne',
  lastName: 'Périn',
  phone: '',
  role: 'owner',
  status: 'active',
  joinedAt: '2026-07-30T10:00:00.000Z',
};

/** La fiche, réduite aux champs que la projection lit. */
function fiche(overrides: Partial<AdminCompanyFacts> = {}): AdminCompanyFacts {
  return {
    raisonSociale: 'Boulangerie Périn SARL',
    enseigne: '',
    status: 'active',
    grantedTerms: ['monthly'],
    directDebitBlocked: false,
    addresses: { deliveries: [ADDRESS] },
    ...overrides,
  };
}

describe('customerFromCounter', () => {
  const counter: CounterCustomerView = {
    id: 'c1',
    name: 'Boulangerie Périn SARL',
    tradeName: 'Chez Périn',
    reference: 'C-1',
    status: 'active',
    settlesOnAccount: true,
    deliveryAddresses: [ADDRESS],
    buyers: [
      { userId: 'u1', firstName: 'Anne', lastName: 'Périn', email: 'a@b.fr', role: 'owner' },
    ],
  };

  it('projette le détail du comptoir, enseigne d’abord', () => {
    expect(customerFromCounter(counter)).toEqual({
      displayName: 'Chez Périn',
      status: 'active',
      settlesOnAccount: true,
      addresses: [ADDRESS],
      buyers: counter.buyers,
    });
  });

  it('reprend la raison sociale quand l’enseigne est vide', () => {
    expect(customerFromCounter({ ...counter, tradeName: '' }).displayName).toBe(
      'Boulangerie Périn SARL',
    );
  });

  it('prend `settlesOnAccount` tel que le serveur l’a calculé', () => {
    expect(customerFromCounter({ ...counter, settlesOnAccount: false }).settlesOnAccount).toBe(
      false,
    );
  });
});

describe('customerFromAdminCompany', () => {
  it('projette la fiche et ses membres', () => {
    expect(customerFromAdminCompany(fiche(), [MEMBER])).toEqual({
      displayName: 'Boulangerie Périn SARL',
      status: 'active',
      settlesOnAccount: true,
      addresses: [ADDRESS],
      buyers: [MEMBER],
    });
  });

  it.each([
    ['la société n’est pas active', { status: 'pending' as const }],
    ['aucun terme n’est accordé', { grantedTerms: [] }],
    ['la comptabilité a bloqué le prélèvement', { directDebitBlocked: true }],
  ])('ne règle pas au compte quand %s', (_label, overrides) => {
    expect(customerFromAdminCompany(fiche(overrides), []).settlesOnAccount).toBe(false);
  });
});
