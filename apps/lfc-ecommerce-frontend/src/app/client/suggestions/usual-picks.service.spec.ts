import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { UsualSuggestionView } from '@lfd/contracts';
import { WORKSPACE_HEADER } from '@lfd/contracts/workspace';
import { of } from 'rxjs';

import { AuthFacade } from '../../auth/auth.facade';
import { ProductAudience } from '../audience/product-audience.service';
import { provideWorkspace, workspaceDouble } from '../client-workspace.fixture';
import { TOMMEUSES } from '../mon-compte/account.fixture';
import { TEST_ITEMS } from '../shop/shop-catalogue.fixture';
import { UsualPicks } from './usual-picks.service';

const [FIRST, SECOND] = TEST_ITEMS;
if (FIRST === undefined || SECOND === undefined) {
  throw new RangeError('la fixture du catalogue n’a plus deux articles');
}

const usualOf = (item: typeof FIRST): UsualSuggestionView => ({
  sku: item.sku,
  item,
  reason: { source: 'data', kind: 'weekly_rhythm', weekday: 'tue' },
});

const ROUTE = (request: { url: string }): boolean =>
  request.url.endsWith('/shop/suggestions/usuals/mine');

const OTHER = { ...TOMMEUSES, id: 'cmp_autre' };

function boot() {
  TestBed.resetTestingModule();
  const workspace = workspaceDouble(TOMMEUSES.id, [TOMMEUSES, OTHER]);
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
      UsualPicks,
    ],
  });
  return {
    usuals: TestBed.inject(UsualPicks),
    http: TestBed.inject(HttpTestingController),
    workspace,
  };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  TestBed.tick();
}

/** Lot d de `caching-usage/plan-espace-retenu.md` : la brique tient les habituels. */
describe('UsualPicks — rangés par société', () => {
  it('rien de l’ancienne société n’est rendu après une bascule, même si sa réponse arrive tard', async () => {
    const { usuals, http, workspace } = boot();
    TestBed.tick();
    const first = await vi.waitFor(() => http.expectOne(ROUTE));
    expect(first.request.headers.get(WORKSPACE_HEADER)).toBe(TOMMEUSES.id);

    workspace.choose(OTHER.id);
    TestBed.tick();
    first.flush([usualOf(FIRST)]);
    await settle();
    expect(usuals.current()).toEqual([]);

    const other = await vi.waitFor(() => http.expectOne(ROUTE));
    expect(other.request.headers.get(WORKSPACE_HEADER)).toBe(OTHER.id);
    other.flush([usualOf(SECOND)]);
    await settle();

    expect(usuals.current().map((view) => view.sku)).toEqual([SECOND.sku]);
    http.verify();
  });

  it('en perso, ne montre plus rien et ne demande rien', async () => {
    const { usuals, http, workspace } = boot();
    TestBed.tick();
    (await vi.waitFor(() => http.expectOne(ROUTE))).flush([usualOf(FIRST)]);
    await settle();
    expect(usuals.current().map((view) => view.sku)).toEqual([FIRST.sku]);

    workspace.choose('personal');
    await settle();

    expect(usuals.current()).toEqual([]);
    http.expectNone(ROUTE);
  });
});
