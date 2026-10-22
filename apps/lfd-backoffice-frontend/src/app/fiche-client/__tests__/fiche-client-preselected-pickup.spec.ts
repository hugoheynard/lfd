import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { PickupAddressView } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';
import { FicheClientStore } from '../informations/fiche-client.store';

function point(id: string, label: string): PickupAddressView {
  return {
    id,
    label,
    ligne1: '1 rue du Four',
    ligne2: '',
    codePostal: '73150',
    ville: 'Val d’Isère',
    pays: 'France',
    discounts: { b2b: null, b2c: null },
    opening: { publicOpening: null, proPickup: null },
  };
}

const LABO = point('pick_1', 'Labo');
const VILLAGE = point('pick_2', 'Village');

/** Une fiche quelconque — seule sa préférence compte ici. */
const COMPANY: AdminCompanyDetail = {
  activation: null,
  gate: { canActivate: false, blocking: [], checklist: [] },
  suspensionCause: null,
  id: 'cmp_1',
  reference: 'C-ADM001',
  raisonSociale: 'Café des Halles SAS',
  enseigne: '',
  formeJuridique: 'SAS',
  siret: '81245678900021',
  siren: '',
  vatNumber: '',
  status: 'pending',
  grantedTerms: [],
  requestedTerm: null,
  directDebitBlocked: false,
  primaryContact: {
    id: null,
    role: null,
    firstName: 'Camille',
    lastName: 'Rousseau',
    fonction: 'Gérante',
    email: 'gerant@halles.fr',
    phone: '',
  },
  kbis: null,
  owner: null,
  hasOpenSupportRequest: false,
  parent: null,
  createdAt: '2026-07-30T10:00:00.000Z',
  activatedAt: null,
  warnings: [],
  vatNumberRequired: true,
  hasBankAccount: false,
  hierarchy: {
    parent: null,
    subAccounts: [],
    follows: [],
    groupWithoutDelivery: false,
    collectionForm: null,
  },
  addresses: { billing: null, deliveries: [] },
  contacts: [],
  fulfillmentPreference: {
    method: null,
    pickupAddressId: null,
    deliveryAddressId: null,
    signatureRequired: false,
  },
};

function preferring(pickupAddressId: string | null): AdminCompanyDetail {
  return {
    ...COMPANY,
    fulfillmentPreference: {
      ...COMPANY.fulfillmentPreference,
      method: pickupAddressId === null ? null : 'pickup',
      pickupAddressId,
    },
  };
}

/**
 * Le point montré quand la livraison est masquée (Hugo, 2026-10-15) : il n'y
 * a plus de point par défaut — c'est la règle de la boutique et de la caisse,
 * `preselectedPickupId`, sur la liste que le serveur sert pour ce client.
 */
describe('FicheClientStore — le point présélectionné', () => {
  let store: FicheClientStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), FicheClientStore],
    });
    store = TestBed.inject(FicheClientStore);
  });

  it('retient le seul point ouvert au client', () => {
    store.company.set(preferring(null));
    store.pickups.set([VILLAGE]);
    expect(store.preselectedPickup()?.id).toBe('pick_2');
  });

  it('n’en retient aucun à plusieurs, sans préférence', () => {
    store.company.set(preferring(null));
    store.pickups.set([LABO, VILLAGE]);
    expect(store.preselectedPickup()).toBeNull();
  });

  it('retient le point préféré du client parmi plusieurs', () => {
    store.company.set(preferring('pick_2'));
    store.pickups.set([LABO, VILLAGE]);
    expect(store.preselectedPickup()?.id).toBe('pick_2');
  });
});
