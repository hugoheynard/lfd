import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { CompanyOrderListItemView } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { provideRecognised } from '../client-orders.fixture';
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
