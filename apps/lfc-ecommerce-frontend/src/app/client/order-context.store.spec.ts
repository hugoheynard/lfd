import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { type CompanyView, type PickupAddressView, PERSONAL_WORKSPACE } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { provideRecognised } from './client-orders.fixture';
import { TOMMEUSES } from './mon-compte/account.fixture';
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

/** Le point du retrait {@link AU_LABO}, tel que le serveur le sert. */
const LABO_POINT: PickupAddressView = {
  id: 'pick_labo',
  label: 'Le Labo',
  ligne1: 'Route de la Balme',
  ligne2: '',
  codePostal: '73150',
  ville: 'Val d’Isère',
  pays: 'France',
  discounts: { b2b: null, b2c: null },
  opening: { proPickup: null, publicOpening: null },
};

function boot(
  current: string | null,
  companies: readonly CompanyView[] = [],
): { store: OrderContextStore; workspace: WorkspaceDouble } {
  const workspace = workspaceDouble(current, companies);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideWorkspace(workspace),
      provideRecognised(),
      provideHttpClient(),
      provideHttpClientTesting(),
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
    // Le point retenu est servi : depuis le 2026-10-16, une liste servie vide
    // efface le retrait (suite plus bas) — ce n'est pas le sujet ici.
    TestBed.inject(ServicePoints).receive([LABO_POINT], [], [], {
      openToB2b: false,
      openToB2c: false,
    });
    store.choice.set(AU_LABO);
    TestBed.tick();

    expect(store.choice()?.mode).toBe('pickup');
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

/**
 * 2026-10-16 : plus de site par défaut — le dernier site ouvert à une
 * clientèle peut lui être retiré. Un retrait relu du navigateur sur un point
 * que la liste servie ne porte plus mènerait au refus de la caisse.
 */
describe('OrderContextStore — le retrait et la liste servie', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('efface un retrait quand la liste servie pour cet espace est vide', () => {
    const { store } = boot(PERSONAL_WORKSPACE);
    TestBed.inject(ServicePoints).receive([], [], []);
    store.choice.set(AU_LABO);
    TestBed.tick();

    expect(store.choice()).toBeNull();
  });

  it('efface un retrait sur un point que la liste ne porte plus', () => {
    const { store } = boot(PERSONAL_WORKSPACE);
    TestBed.inject(ServicePoints).receive([{ ...LABO_POINT, id: 'pick_village' }], [], []);
    store.choice.set(AU_LABO);
    TestBed.tick();

    expect(store.choice()).toBeNull();
  });

  it('garde le retrait sur un point servi', () => {
    const { store } = boot(PERSONAL_WORKSPACE);
    TestBed.inject(ServicePoints).receive([LABO_POINT], [], []);
    store.choice.set(AU_LABO);
    TestBed.tick();

    expect(store.choice()?.mode).toBe('pickup');
  });

  /** Une liste pas encore lue ne dit rien : elle n'efface pas. */
  it('n’efface rien tant que la liste n’a pas été servie', () => {
    const { store } = boot(PERSONAL_WORKSPACE);
    store.choice.set(AU_LABO);
    TestBed.tick();

    expect(store.choice()?.mode).toBe('pickup');
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
