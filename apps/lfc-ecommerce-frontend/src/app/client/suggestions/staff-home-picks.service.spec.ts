import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { HomeSuggestionView } from '@lfd/contracts';
import { WORKSPACE_HEADER } from '@lfd/contracts/workspace';
import { of } from 'rxjs';

import { AuthFacade } from '../../auth/auth.facade';
import { ProductAudience } from '../audience/product-audience.service';
import { provideWorkspace, workspaceDouble } from '../client-workspace.fixture';
import { TEST_ITEMS } from '../shop/shop-catalogue.fixture';
import { StaffHomePicks } from './staff-home-picks.service';

const [FIRST, SECOND] = TEST_ITEMS;
if (FIRST === undefined || SECOND === undefined) {
  throw new RangeError('la fixture du catalogue n’a plus deux articles');
}

const pickOf = (item: typeof FIRST): HomeSuggestionView => ({
  sku: item.sku,
  item,
  reason: { source: 'staff', ruleId: '01jrule', phrase: null },
});

const MINE = (request: { url: string }): boolean =>
  request.url.endsWith('/shop/suggestions/home/mine');

function boot() {
  TestBed.resetTestingModule();
  const workspace = workspaceDouble();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideWorkspace(workspace),
      {
        provide: AuthFacade,
        useValue: { isAuthenticated: signal(true), accessToken$: () => of('jeton') },
      },
      { provide: ProductAudience, useValue: { record: () => undefined } },
      StaffHomePicks,
    ],
  });
  return {
    picks: TestBed.inject(StaffHomePicks),
    http: TestBed.inject(HttpTestingController),
    workspace,
  };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  TestBed.tick();
}

/** Lot d de `caching-usage/dans-quel-espace-est-le-client.md` : la brique tient les suggestions de l'accueil. */
describe('StaffHomePicks — rangées par espace', () => {
  it('lit la route murée, l’en-tête d’espace tiré de la clé', async () => {
    const { picks, http } = boot();
    TestBed.tick();
    const asked = await vi.waitFor(() => http.expectOne(MINE));
    expect(asked.request.headers.get(WORKSPACE_HEADER)).toBe('personal');
    asked.flush([pickOf(FIRST)]);
    await settle();

    expect(picks.current().map((view) => view.sku)).toEqual([FIRST.sku]);
    http.verify();
  });

  it('rien de l’ancien espace n’est rendu après une bascule, même si sa réponse arrive tard', async () => {
    const { picks, http, workspace } = boot();
    TestBed.tick();
    const personal = await vi.waitFor(() => http.expectOne(MINE));

    workspace.choose('cmp_pro');
    TestBed.tick();
    personal.flush([pickOf(FIRST)]);
    await settle();
    expect(picks.current()).toEqual([]);

    const pro = await vi.waitFor(() => http.expectOne(MINE));
    expect(pro.request.headers.get(WORKSPACE_HEADER)).toBe('cmp_pro');
    pro.flush([pickOf(SECOND)]);
    await settle();

    expect(picks.current().map((view) => view.sku)).toEqual([SECOND.sku]);
    http.verify();
  });
});
