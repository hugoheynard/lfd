import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { CompanyAddressesView, DeliveryAddressPayload } from '@lfd/contracts';
import { WORKSPACE_HEADER } from '@lfd/contracts/workspace';
import { of } from 'rxjs';

import { AccountService } from '../account/account.service';
import { AuthFacade } from '../auth/auth.facade';
import { addressAt, ClientAddresses } from './client-addresses.service';
import { provideWorkspace, workspaceDouble } from './client-workspace.fixture';
import { TOMMEUSES } from './mon-compte/account.fixture';

const TOMMEUSES_1 = { ...TOMMEUSES, id: 'cmp_1' };
const TOMMEUSES_B = { ...TOMMEUSES, id: 'cmp_b' };

const CARNET: CompanyAddressesView = {
  billing: {
    id: 'adr_siege',
    label: 'Siège',
    ligne1: '12 chemin des Barmettes',
    ligne2: '',
    codePostal: '73150',
    ville: "Val d'Isère",
    pays: 'France',
  },
  deliveries: [],
};

/** Le compte tel que le shell l'a déjà lu — une entreprise, la sienne. */
function bootWith(companies: readonly { id: string }[]): HttpTestingController {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: AuthFacade,
        useValue: { isAuthenticated: () => true, accessToken$: () => of('jeton') },
      },
      {
        provide: AccountService,
        useValue: {
          companies: () => companies,
          workspaceWrite: () => null,
          // Le compte relu : une société seule est l'espace, et c'est son carnet qui se lit.
          account: () => ({
            companies,
            reachableSites: [],
            navPrefs: { catalogueView: null, workspace: null },
          }),
        },
      },
    ],
  });
  return TestBed.inject(HttpTestingController);
}

/**
 * 🔴 **Le carnet était écrit en dur** (« Le Chalet », « Bureau »). C'était la
 * plus dangereuse des maquettes du front : une adresse d'exemple posée à côté
 * d'une commande réelle est une livraison à la mauvaise porte.
 */
describe('le carnet d’adresses du client', () => {
  it('lit les adresses de l’entreprise du demandeur', async () => {
    const http = bootWith([{ id: 'cmp_1' }]);
    const addresses = TestBed.inject(ClientAddresses);
    TestBed.tick();
    await Promise.resolve();

    http.expectOne((r) => r.url.endsWith('/companies/cmp_1/addresses')).flush(CARNET);
    // Le jeton puis la réponse : deux `await`, donc deux microtâches avant que
    // le signal porte la valeur.
    await Promise.resolve();
    await Promise.resolve();

    expect(addresses.billing()?.ligne1).toBe('12 chemin des Barmettes');
  });

  /**
   * Personne de reconnu ⇒ aucune entreprise ⇒ **rien**, et surtout pas des
   * adresses d'exemple : elles seraient celles de quelqu'un d'autre.
   */
  it('n’appelle rien et ne propose rien sans entreprise', () => {
    const http = bootWith([]);
    const addresses = TestBed.inject(ClientAddresses);
    TestBed.tick();

    http.verify();
    expect(addresses.deliveries()).toEqual([]);
    expect(addresses.billing()).toBeNull();
  });

  /** Un échec laisse le carnet VIDE : l'écran retombe sur la saisie libre. */
  it('laisse le carnet vide quand la lecture échoue', async () => {
    const http = bootWith([{ id: 'cmp_1' }]);
    const addresses = TestBed.inject(ClientAddresses);
    TestBed.tick();
    await Promise.resolve();

    http
      .expectOne((r) => r.url.endsWith('/companies/cmp_1/addresses'))
      .flush({}, { status: 500, statusText: 'Server Error' });
    await Promise.resolve();

    expect(addresses.deliveries()).toEqual([]);
  });
});

describe('les écritures du carnet', () => {
  const PAYLOAD: DeliveryAddressPayload = {
    label: 'Chalet',
    ligne1: '1 route du Col',
    ligne2: '',
    codePostal: '73150',
    ville: "Val d'Isère",
    pays: 'France',
    isDefault: false,
    specs: {
      note: '',
      slotList: { mode: 'everyday', slots: [] },
      deliveryContact: null,
      gps: null,
      signatureRequired: null,
    },
  };

  /** Le jeton, l'écriture, puis la relecture : trois vols, dans cet ordre. */
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 4; i += 1) {
      await Promise.resolve();
    }
  };

  it('modifie une livraison par PATCH, relit le carnet, et rend `null`', async () => {
    // L'espace est la société écrite : un carnet relu pour une AUTRE maison que
    // celle de l'espace est écarté, et c'est voulu (cf. `ClientAddresses.stillFor`).
    const http = bootWith([{ id: 'cmp_1' }]);
    const addresses = TestBed.inject(ClientAddresses);

    const done = addresses.updateDelivery('cmp_1', 'adr_1', PAYLOAD);
    await settle();
    const write = http.expectOne((r) =>
      r.url.endsWith('/companies/cmp_1/delivery-addresses/adr_1'),
    );
    expect(write.request.method).toBe('PATCH');
    expect(write.request.body).toEqual(PAYLOAD);
    write.flush(null);
    await settle();
    http.expectOne((r) => r.url.endsWith('/companies/cmp_1/addresses')).flush(CARNET);

    await expect(done).resolves.toBeNull();
    expect(addresses.billing()?.ligne1).toBe('12 chemin des Barmettes');
  });

  it('rend le message du serveur quand l’écriture est refusée, sans relire', async () => {
    const http = bootWith([]);
    const addresses = TestBed.inject(ClientAddresses);

    const done = addresses.addDelivery('cmp_1', PAYLOAD);
    await settle();
    const write = http.expectOne((r) => r.url.endsWith('/companies/cmp_1/delivery-addresses'));
    expect(write.request.method).toBe('POST');
    write.flush(
      { message: 'Code postal hors de nos zones.' },
      { status: 400, statusText: 'Bad Request' },
    );

    await expect(done).resolves.toBe('Code postal hors de nos zones.');
    http.verify();
  });

  /** Régression : un double clic, ou un réessai après une coupure, ajoutait deux adresses. */
  it('renvoie la même clé d’intention pour le même ajout tant qu’il n’a pas abouti', async () => {
    const http = bootWith([]);
    const addresses = TestBed.inject(ClientAddresses);

    const first = addresses.addDelivery('cmp_1', PAYLOAD);
    await settle();
    const refused = http.expectOne((r) => r.url.endsWith('/companies/cmp_1/delivery-addresses'));
    const key = refused.request.headers.get('Idempotency-Key');
    refused.flush({ message: 'Indisponible.' }, { status: 503, statusText: 'Unavailable' });
    await first;

    void addresses.addDelivery('cmp_1', PAYLOAD);
    await settle();
    const retried = http.expectOne((r) => r.url.endsWith('/companies/cmp_1/delivery-addresses'));

    expect(key).not.toBeNull();
    expect(retried.request.headers.get('Idempotency-Key')).toBe(key);
    expect(retried.request.headers.get('Authorization')).toBe('Bearer jeton');
  });

  /**
   * Archiver par DELETE, puis relire : si l'archivée était la défaut, c'est le
   * serveur qui promeut sa remplaçante, et seule la relecture la montre.
   */
  it('supprime une livraison par DELETE, avec le jeton, relit le carnet, et rend `null`', async () => {
    const http = bootWith([]);
    const addresses = TestBed.inject(ClientAddresses);

    const done = addresses.removeDelivery('cmp_1', 'adr_1');
    await settle();
    const write = http.expectOne((r) =>
      r.url.endsWith('/companies/cmp_1/delivery-addresses/adr_1'),
    );
    expect(write.request.method).toBe('DELETE');
    expect(write.request.body).toBeNull();
    expect(write.request.headers.get('Authorization')).toBe('Bearer jeton');
    write.flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    const reread = http.expectOne((r) => r.url.endsWith('/companies/cmp_1/addresses'));
    expect(reread.request.method).toBe('GET');
    reread.flush(CARNET);

    await expect(done).resolves.toBeNull();
    http.verify();
  });

  it('désigne la défaut par PATCH …/default, sans corps, relit le carnet, et rend `null`', async () => {
    // L'espace est la société écrite : un carnet relu pour une AUTRE maison que
    // celle de l'espace est écarté, et c'est voulu (cf. `ClientAddresses.stillFor`).
    const http = bootWith([{ id: 'cmp_1' }]);
    const addresses = TestBed.inject(ClientAddresses);

    const done = addresses.makeDefaultDelivery('cmp_1', 'adr_2');
    await settle();
    const write = http.expectOne((r) =>
      r.url.endsWith('/companies/cmp_1/delivery-addresses/adr_2/default'),
    );
    expect(write.request.method).toBe('PATCH');
    expect(write.request.body).toBeNull();
    expect(write.request.headers.get('Authorization')).toBe('Bearer jeton');
    write.flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    http.expectOne((r) => r.url.endsWith('/companies/cmp_1/addresses')).flush(CARNET);

    await expect(done).resolves.toBeNull();
    expect(addresses.billing()?.ligne1).toBe('12 chemin des Barmettes');
    http.verify();
  });

  it.each([
    ['removeDelivery', '/companies/cmp_1/delivery-addresses/adr_1'],
    ['makeDefaultDelivery', '/companies/cmp_1/delivery-addresses/adr_1/default'],
  ] as const)('%s rend le message du serveur au refus, sans relire', async (method, path) => {
    const http = bootWith([]);
    const addresses = TestBed.inject(ClientAddresses);

    const done =
      method === 'removeDelivery'
        ? addresses.removeDelivery('cmp_1', 'adr_1')
        : addresses.makeDefaultDelivery('cmp_1', 'adr_1');
    await settle();
    http
      .expectOne((r) => r.url.endsWith(path))
      .flush(
        { message: 'Adresse de livraison introuvable.' },
        { status: 404, statusText: 'Not Found' },
      );

    await expect(done).resolves.toBe('Adresse de livraison introuvable.');
    http.verify();
  });
});

describe('le complément d’une adresse', () => {
  it('se dérive du libellé, faute de champ au contrat', () => {
    expect(addressAt('Chalet')).toBe('au Chalet');
  });

  it('reste neutre quand il n’y a pas de libellé', () => {
    expect(addressAt('  ')).toBe('à cette adresse');
  });
});

/**
 * Lot d (brique par clé de contexte) : le carnet suivait l'espace avec sa clé
 * maison `loadedFor` ; une bascule doit ne rien montrer de la maison quittée.
 */
describe('le carnet à la bascule d’espace', () => {
  const CARNET_B: CompanyAddressesView = {
    ...CARNET,
    billing: { ...CARNET.billing!, id: 'adr_b', ligne1: '3 rue du Lac' },
  };
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 3; i += 1) {
      await Promise.resolve();
    }
  };

  it('ne rend rien de l’ancien espace, et lit le nouveau sous son en-tête', async () => {
    const workspace = workspaceDouble('cmp_1', [TOMMEUSES_1, TOMMEUSES_B]);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthFacade,
          useValue: { isAuthenticated: () => true, accessToken$: () => of('jeton') },
        },
        provideWorkspace(workspace),
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const addresses = TestBed.inject(ClientAddresses);
    TestBed.tick();
    await settle();
    http.expectOne((r) => r.url.endsWith('/companies/cmp_1/addresses')).flush(CARNET);
    await settle();
    expect(addresses.billing()?.ligne1).toBe('12 chemin des Barmettes');

    workspace.current.set('cmp_b');
    TestBed.tick();
    expect(addresses.billing()).toBeNull();
    await settle();
    const next = http.expectOne((r) => r.url.endsWith('/companies/cmp_b/addresses'));
    expect(next.request.headers.get(WORKSPACE_HEADER)).toBe('cmp_b');
    next.flush(CARNET_B);
    await settle();
    expect(addresses.billing()?.ligne1).toBe('3 rue du Lac');
  });
});
