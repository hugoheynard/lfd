import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { CompanyOrderListItemView } from '@lfd/contracts';
import { throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { AuthFacade } from '../../auth/auth.facade';

import { provideRecognised, RECOGNISED } from '../client-orders.fixture';
import { provideWorkspace, workspaceDouble } from '../client-workspace.fixture';
import { TOMMEUSES } from '../mon-compte/account.fixture';
import { ClientOrderHistory } from './client-order-history.service';
import { LIVE_PICKUP } from './order-view.fixture';

const HOTEL = { companyId: 'co_hotel', name: 'Hôtel des Cimes' };

const OWN: CompanyOrderListItemView = {
  ...LIVE_PICKUP,
  id: 'ord_own',
  site: null,
  author: { kind: 'customer', name: 'Camille D.' },
};
const OF_SITE: CompanyOrderListItemView = {
  ...LIVE_PICKUP,
  id: 'ord_site',
  site: HOTEL,
  author: { kind: 'team' },
};

/** Les microtâches du jeton passées, la requête est partie. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve));

describe('ClientOrderHistory — les commandes des sites (plan des commandes des sites, C2)', () => {
  let http: HttpTestingController;
  let history: ClientOrderHistory;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRecognised(),
        provideWorkspace(workspaceDouble(TOMMEUSES.id, [TOMMEUSES])),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    history = TestBed.inject(ClientOrderHistory);
    TestBed.tick();
  });

  const listRequest = () =>
    http.expectOne((r) => r.url.endsWith(`/companies/${TOMMEUSES.id}/orders`));

  it('retient les sites que la liste complète nomme, et rien sans eux', async () => {
    await settle();
    listRequest().flush([OWN, OF_SITE]);
    await settle();
    expect(history.sites()).toEqual([HOTEL]);
  });

  it('ne nomme aucun site quand la liste n’en porte pas (un site, un principal sans héritage)', async () => {
    await settle();
    listRequest().flush([OWN]);
    await settle();
    expect(history.sites()).toEqual([]);
  });

  it('relit le filtre au SERVEUR, par `?site=`, et garde les autres sites au choix', async () => {
    await settle();
    listRequest().flush([OWN, OF_SITE]);
    await settle();

    history.chooseSite(HOTEL.companyId);
    await settle();
    const filtered = listRequest();
    expect(filtered.request.params.get('site')).toBe(HOTEL.companyId);
    filtered.flush([OF_SITE]);
    await settle();
    expect(history.orders().map((order) => order.id)).toEqual(['ord_site']);

    history.chooseSite(TOMMEUSES.id);
    await settle();
    listRequest().flush([OWN]);
    await settle();
    // Filtrer sur le principal ne fait pas disparaître le filtre.
    expect(history.sites()).toEqual([HOTEL]);

    history.chooseSite(null);
    await settle();
    expect(listRequest().request.params.has('site')).toBe(false);
  });
});

describe('ClientOrderHistory — les jours de retrait (plan du récapitulatif, R3)', () => {
  let http: HttpTestingController;
  let history: ClientOrderHistory;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRecognised(),
        provideWorkspace(workspaceDouble(TOMMEUSES.id, [TOMMEUSES])),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    history = TestBed.inject(ClientOrderHistory);
    TestBed.tick();
  });

  const listRequest = () =>
    http.expectOne((r) => r.url.endsWith(`/companies/${TOMMEUSES.id}/orders`));

  it('relit les bornes au SERVEUR, combinées au site, et garde les sites au choix', async () => {
    await settle();
    listRequest().flush([OWN, OF_SITE]);
    await settle();

    history.chooseSite(HOTEL.companyId);
    await settle();
    listRequest().flush([OF_SITE]);
    await settle();

    history.chooseDays({ from: '2026-10-01', to: '2026-10-15' });
    await settle();
    const bounded = listRequest();
    expect(bounded.request.params.get('site')).toBe(HOTEL.companyId);
    expect(bounded.request.params.get('from')).toBe('2026-10-01');
    expect(bounded.request.params.get('to')).toBe('2026-10-15');
    bounded.flush([]);
    await settle();
    expect(history.orders()).toEqual([]);
    expect(history.sites()).toEqual([HOTEL]);

    history.chooseDays({ from: null, to: '2026-10-15' });
    await settle();
    const onlyTo = listRequest();
    expect(onlyTo.request.params.has('from')).toBe(false);
    onlyTo.flush([]);
  });

  it('les mêmes bornes ne relisent rien', async () => {
    await settle();
    listRequest().flush([OWN]);
    await settle();
    history.chooseDays({ from: null, to: null });
    await settle();
    http.expectNone((r) => r.url.endsWith('/orders'));
  });
});

describe('ClientOrderHistory — un échec se dit', () => {
  /**
   * Régression (production, 2026-10-27) : un jeton qui ne se renouvelle plus
   * laissait « Mes commandes » vide, sans état — la personne croyait n'avoir
   * aucune commande et a dû se déconnecter pour s'en sortir.
   */
  it('un jeton qui ne se renouvelle plus n’affiche plus une page Mes commandes vide', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthFacade,
          useValue: {
            ...RECOGNISED,
            accessToken$: () => throwError(() => ({ error: 'invalid_grant' })),
          },
        },
        provideWorkspace(workspaceDouble(TOMMEUSES.id, [TOMMEUSES])),
      ],
    });
    const history = TestBed.inject(ClientOrderHistory);
    TestBed.tick();
    await settle();

    expect(history.failed()).toBe(true);
    TestBed.inject(HttpTestingController).verify();
  });

  it('un 401 de l’API pose l’échec, et une relecture réussie le lève', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRecognised(),
        provideWorkspace(workspaceDouble(TOMMEUSES.id, [TOMMEUSES])),
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const history = TestBed.inject(ClientOrderHistory);
    TestBed.tick();
    await settle();
    const list = () => http.expectOne((r) => r.url.endsWith(`/companies/${TOMMEUSES.id}/orders`));

    list().flush(null, { status: 401, statusText: 'Unauthorized' });
    await settle();
    expect(history.failed()).toBe(true);

    history.reload();
    await settle();
    list().flush([OWN]);
    await settle();
    expect(history.failed()).toBe(false);
    expect(history.orders().map((order) => order.id)).toEqual(['ord_own']);
  });
});
