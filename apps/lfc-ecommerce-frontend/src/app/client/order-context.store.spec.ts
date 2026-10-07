import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type CompanyView, PERSONAL_WORKSPACE } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { provideRecognised } from './client-orders.fixture';
import { TOMMEUSES } from './mon-compte/account.fixture';
import { ClientFeatureAccess } from './feature-access/client-feature-access.service';
import { ServicePoints } from './shop/pickup-points.store';
import {
  provideWorkspace,
  workspaceDouble,
  type WorkspaceDouble,
} from './client-workspace.fixture';
import { OrderContextStore, parseChoice, type ServiceChoice } from './order-context.store';

const AU_LABO: ServiceChoice = {
  mode: 'pickup',
  place: 'Le Labo',
  at: 'au Labo',
  address: 'Route de la Balme, Val d’Isère',
  pickupAddressId: 'pick_labo',
  slot: '7 h – 8 h',
  window: { start: '07:00', end: '08:00' },
  date: '2026-09-07',
};

/** L'accès aux fonctions, réduit à ce que le magasin lit ; lu et ouvert par défaut. */
function accessDouble(
  publicDelivery: 'open' | 'closed' = 'open',
  state: 'ready' | 'loading' = 'ready',
) {
  return {
    state: signal(state),
    publicDelivery: signal(publicDelivery),
    load: () => Promise.resolve(),
  };
}

function boot(
  current: string | null,
  companies: readonly CompanyView[] = [],
  access = accessDouble(),
): { store: OrderContextStore; workspace: WorkspaceDouble } {
  const workspace = workspaceDouble(current, companies);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideWorkspace(workspace),
      provideRecognised(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ClientFeatureAccess, useValue: access },
    ],
  });
  const store = TestBed.inject(OrderContextStore);
  TestBed.tick();
  return { store, workspace };
}

/** Plan espace de travail, D7 : une adresse appartient à une société. */
describe('OrderContextStore — le mode de service et l’espace', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /** Le choix relu du navigateur a été fait dans l'espace qui se résout : la page se charge, rien ne bascule. */
  it('la première résolution de l’espace n’efface rien', () => {
    localStorage.setItem('lfc.order.choice', JSON.stringify(AU_LABO));
    const { store, workspace } = boot(null);
    expect(store.choice()?.place).toBe('Le Labo');

    workspace.current.set('cmp_a');
    TestBed.tick();

    expect(store.choice()?.place).toBe('Le Labo');
  });

  it('un changement d’espace efface le mode de service', () => {
    const { store, workspace } = boot('cmp_a');
    store.choice.set(AU_LABO);

    workspace.current.set(PERSONAL_WORKSPACE);
    TestBed.tick();

    expect(store.choice()).toBeNull();
  });

  it('un choix posé après la bascule est gardé', () => {
    const { store, workspace } = boot('cmp_a');
    workspace.current.set('cmp_b');
    TestBed.tick();

    store.choice.set(AU_LABO);
    TestBed.tick();

    expect(store.choice()?.place).toBe('Le Labo');
  });
});

const LIVRE: ServiceChoice = {
  mode: 'delivery',
  place: "Val d'Isère",
  at: "à Val d'Isère",
  address: '12 rue du Four, 73150',
  codePostal: '73150',
  slot: '9 h – 10 h',
  window: null,
  date: '2026-09-07',
  deliveryAddressId: 'adr_four',
  deliveryAddress: {
    label: "Val d'Isère",
    ligne1: '12 rue du Four',
    ligne2: '',
    codePostal: '73150',
    ville: "Val d'Isère",
    pays: 'France',
  },
};

const ACTIVE: CompanyView = { ...TOMMEUSES, id: 'cmp_a', status: 'active' };

/** Plan remise et livraison par clientèle, D7 : une livraison gardée et devenue interdite s'efface. */
describe('OrderContextStore — la livraison et la clientèle', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const closedToB2c = { openToB2b: true, openToB2c: false };

  it('efface une livraison fermée à la clientèle', () => {
    const { store } = boot(PERSONAL_WORKSPACE);
    TestBed.inject(ServicePoints).receive([], [], [], closedToB2c);
    store.choice.set(LIVRE);
    TestBed.tick();

    expect(store.choice()).toBeNull();
  });

  it('garde la livraison d’une société active quand elle reste ouverte aux pros', () => {
    const { store } = boot(ACTIVE.id, [ACTIVE]);
    TestBed.inject(ServicePoints).receive([], [], [], closedToB2c);
    store.choice.set(LIVRE);
    TestBed.tick();

    expect(store.choice()?.mode).toBe('delivery');
  });

  it('garde le retrait, que la livraison soit fermée ou non', () => {
    const { store } = boot(PERSONAL_WORKSPACE);
    TestBed.inject(ServicePoints).receive([], [], [], { openToB2b: false, openToB2c: false });
    store.choice.set(AU_LABO);
    TestBed.tick();

    expect(store.choice()?.mode).toBe('pickup');
  });

  /**
   * Régression : un particulier gardait un choix de livraison alors que la
   * livraison aux particuliers était fermée — le magasin ne lisait que le
   * réglage par clientèle, et `POST /orders` refuse désormais (audit
   * livraisons, § 3.4, 2026-10-07).
   */
  it('efface la livraison d’un particulier quand la livraison publique est fermée', () => {
    const { store } = boot(PERSONAL_WORKSPACE, [], accessDouble('closed'));
    TestBed.inject(ServicePoints).receive([], [], [], { openToB2b: true, openToB2c: true });
    store.choice.set(LIVRE);
    TestBed.tick();

    expect(store.choice()).toBeNull();
  });

  it('garde celle d’un pro, et n’efface rien tant que l’accès n’est pas lu', () => {
    const open = { openToB2b: true, openToB2c: true };
    const pro = boot(ACTIVE.id, [ACTIVE], accessDouble('closed'));
    TestBed.inject(ServicePoints).receive([], [], [], open);
    pro.store.choice.set(LIVRE);
    TestBed.tick();
    expect(pro.store.choice()?.mode).toBe('delivery');

    const unread = boot(PERSONAL_WORKSPACE, [], accessDouble('closed', 'loading'));
    TestBed.inject(ServicePoints).receive([], [], [], open);
    unread.store.choice.set(LIVRE);
    TestBed.tick();
    expect(unread.store.choice()?.mode).toBe('delivery');
  });

  /** Le défaut ouvert n'est pas une réponse : rien ne s'efface sur un réglage non lu. */
  it('n’efface rien tant que le réglage n’est pas lu', () => {
    const { store } = boot(PERSONAL_WORKSPACE);
    TestBed.inject(ServicePoints).receive([], [], []);
    store.choice.set(LIVRE);
    TestBed.tick();

    expect(store.choice()?.mode).toBe('delivery');
  });

  /** Un pro dont `/me` n'a pas répondu n'est pas un particulier. */
  it('n’efface rien tant que la clientèle est inconnue', () => {
    localStorage.setItem('lfc.order.choice', JSON.stringify(LIVRE));
    const { store, workspace } = boot(null, [ACTIVE]);
    TestBed.inject(ServicePoints).receive([], [], [], closedToB2c);
    TestBed.tick();
    expect(store.choice()?.mode).toBe('delivery');

    workspace.current.set(ACTIVE.id);
    TestBed.tick();
    expect(store.choice()?.mode).toBe('delivery');
  });
});

/** Un choix stocké avant le 2026-09-29 n'a pas `deliveryAddressId`. */
describe('parseChoice — l’adresse du carnet', () => {
  it('relit un stockage ancien, sans l’id, en `null` et non en erreur', () => {
    const older = Object.fromEntries(
      Object.entries(LIVRE).filter(([key]) => key !== 'deliveryAddressId'),
    );
    const parsed = parseChoice(older);

    expect(parsed?.mode).toBe('delivery');
    expect(parsed?.mode === 'delivery' ? parsed.deliveryAddressId : 'absent').toBeNull();
  });

  it('relit l’id quand il est stocké', () => {
    const parsed = parseChoice(JSON.parse(JSON.stringify(LIVRE)));

    expect(parsed?.mode === 'delivery' ? parsed.deliveryAddressId : null).toBe('adr_four');
  });
});
