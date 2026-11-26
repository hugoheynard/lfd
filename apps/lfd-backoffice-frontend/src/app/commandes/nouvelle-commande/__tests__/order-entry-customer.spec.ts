import {
  NO_FULFILLMENT_PREFERENCE,
  type CompanyMemberView,
  type CounterCustomerView,
  type DeliveryAddressView,
} from '@lfd/contracts';
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
    slotList: { mode: 'everyday', slots: [] },
    deliveryContact: null,
    gps: null,
    signatureRequired: false,
  },
  procedureStepCount: 0,
  depositAllowed: false,
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
    payerSettlesOnAccount: true,
    formeJuridique: 'sarl',
    addresses: { deliveries: [ADDRESS] },
    fulfillmentPreference: NO_FULFILLMENT_PREFERENCE,
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
    payerIsPublic: false,
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
      payerIsPublic: false,
      addresses: [ADDRESS],
      buyers: counter.buyers,
      // Le comptoir ne lit pas la préférence : la présélection retombe sur le
      // seul point ouvert (2026-10-15).
      preferredPickupId: null,
    });
  });

  it('reprend la raison sociale quand l’enseigne est vide', () => {
    expect(customerFromCounter({ ...counter, tradeName: '' }).displayName).toBe(
      'Boulangerie Périn SARL',
    );
  });

  it('prend `payerIsPublic` tel que le serveur l’a calculé', () => {
    expect(customerFromCounter({ ...counter, payerIsPublic: true }).payerIsPublic).toBe(true);
  });

  it('prend `settlesOnAccount` tel que le serveur l’a calculé', () => {
    expect(customerFromCounter({ ...counter, settlesOnAccount: false }).settlesOnAccount).toBe(
      false,
    );
  });
});

describe('customerFromAdminCompany', () => {
  /** Hugo, 2026-11-23 : une commande de l'équipe passe dans tous les cas. */
  it('🔴 propose les invités comme les actifs, jamais un compte désactivé', () => {
    const invited = { ...MEMBER, userId: 'usr_invited', status: 'invited' as const };
    const disabled = { ...MEMBER, userId: 'usr_off', status: 'disabled' as const };

    const buyers = customerFromAdminCompany(fiche(), [invited, MEMBER, disabled]).buyers;

    expect(buyers.map((buyer) => buyer.userId)).toEqual(['usr_invited', MEMBER.userId]);
  });

  it('projette la fiche et ses membres', () => {
    expect(customerFromAdminCompany(fiche(), [MEMBER])).toEqual({
      displayName: 'Boulangerie Périn SARL',
      status: 'active',
      settlesOnAccount: true,
      payerIsPublic: false,
      addresses: [ADDRESS],
      buyers: [MEMBER],
      preferredPickupId: null,
    });
  });

  it('reprend le point de retrait préféré de la fiche — la présélection en part', () => {
    const preferred = fiche({
      fulfillmentPreference: {
        ...NO_FULFILLMENT_PREFERENCE,
        method: 'pickup',
        pickupAddressId: 'pick_2',
      },
    });
    expect(customerFromAdminCompany(preferred, []).preferredPickupId).toBe('pick_2');
  });

  it.each([
    ['la société n’est pas active', { status: 'pending' as const }],
    [
      'le payeur n’a pas de crédit, ou son prélèvement est suspendu',
      { payerSettlesOnAccount: false },
    ],
  ])('ne règle pas au compte quand %s', (_label, overrides) => {
    expect(customerFromAdminCompany(fiche(overrides), []).settlesOnAccount).toBe(false);
  });

  /**
   * Régression : la saisie lisait le crédit du SITE, vide, et bloquait « au
   * compte » pour un site facturé chez un principal qui l'avait.
   */
  it('règle au compte selon le crédit du payeur, même sans crédit propre au site', () => {
    expect(
      customerFromAdminCompany(fiche({ payerSettlesOnAccount: true }), []).settlesOnAccount,
    ).toBe(true);
  });

  it('reconnaît un organisme public à sa forme juridique', () => {
    expect(
      customerFromAdminCompany(fiche({ formeJuridique: 'public_local_authority' }), [])
        .payerIsPublic,
    ).toBe(true);
    expect(customerFromAdminCompany(fiche({ formeJuridique: '' }), []).payerIsPublic).toBe(false);
  });
});
