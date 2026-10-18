import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { ProductSuggestionView } from '@lfd/contracts';
import type { ProductAudienceEvent } from '@lfd/contracts/shop-values';
import { of } from 'rxjs';

import { AuthFacade } from '../../auth/auth.facade';
import type { AudienceOrigin } from '../audience/product-audience-queue';
import { ProductAudience } from '../audience/product-audience.service';
import { ClientCart } from '../cart/client-cart.service';
import { provideWorkspace, workspaceDouble } from '../client-workspace.fixture';
import { hydrateWith, TEST_CATALOGUE, TEST_ITEMS } from '../shop/shop-catalogue.fixture';
import { ShopCatalogue } from '../shop/shop-catalogue.store';
import { StaffProductSuggestion } from './staff-product-suggestion.service';

const BAGUETTE = TEST_ITEMS.find((item) => item.sku === 'PAI-001');
if (BAGUETTE === undefined) {
  throw new RangeError('la fixture du catalogue n’a plus de PAI-001');
}

const STAFF_PICK: ProductSuggestionView = {
  sku: 'PAI-001',
  item: BAGUETTE,
  reason: { source: 'staff', ruleId: '01jrule', phrase: null },
};

const ROUTE = (request: { url: string }): boolean =>
  request.url.endsWith('/shop/suggestions/product');

class RecordingAudience {
  readonly events: { sku: string; event: ProductAudienceEvent; origin: AudienceOrigin | null }[] =
    [];
  record(sku: string, event: ProductAudienceEvent, origin: AudienceOrigin | null = null): void {
    this.events.push({ sku, event, origin });
  }
}

function boot() {
  TestBed.resetTestingModule();
  const audience = new RecordingAudience();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideWorkspace(workspaceDouble()),
      {
        provide: AuthFacade,
        useValue: { isAuthenticated: () => false, accessToken$: () => of('') },
      },
      { provide: ProductAudience, useValue: audience },
    ],
  });
  hydrateWith(TestBed.inject(ShopCatalogue), TEST_CATALOGUE);
  return {
    pick: TestBed.inject(StaffProductSuggestion),
    cart: TestBed.inject(ClientCart),
    http: TestBed.inject(HttpTestingController),
    audience,
  };
}

/** Zoneless : on pousse l'effet, puis on laisse charger le morceau et répondre. */
async function answer(
  http: HttpTestingController,
  views: readonly ProductSuggestionView[],
): Promise<unknown> {
  TestBed.tick();
  const asked = await vi.waitFor(() => http.expectOne(ROUTE));
  asked.flush(views);
  await vi.waitFor(() => Promise.resolve());
  await new Promise((resolve) => setTimeout(resolve, 0));
  TestBed.tick();
  return asked.request.body;
}

describe('StaffProductSuggestion', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('ne demande rien tant qu’aucune fiche n’est ouverte', () => {
    const { http } = boot();
    TestBed.tick();

    http.expectNone(ROUTE);
  });

  it('demande UNE fois par ouverture, avec la fiche et le panier, et compte l’affichage', async () => {
    const { pick, cart, http, audience } = boot();
    cart.add('VIE-002');
    pick.open('VIE-001');

    const body = await answer(http, [STAFF_PICK]);
    cart.add('VIE-003');
    TestBed.tick();

    expect(body).toEqual({ sku: 'VIE-001', skus: ['VIE-002'], target: null });
    http.expectNone(ROUTE);
    expect(pick.current()).toEqual(STAFF_PICK);
    expect(audience.events).toEqual([
      {
        sku: 'PAI-001',
        event: 'suggestion_shown',
        origin: { source: 'staff', placement: '01jrule' },
      },
    ]);
  });

  it('compte le clic et l’ajout, à la règle', async () => {
    const { pick, http, audience } = boot();
    pick.open('VIE-001');
    await answer(http, [STAFF_PICK]);

    pick.taken(STAFF_PICK);

    expect(audience.events.map(({ event, origin }) => [event, origin?.placement])).toEqual([
      ['suggestion_shown', '01jrule'],
      ['suggestion_clicked', '01jrule'],
      ['suggestion_added', '01jrule'],
    ]);
  });

  it('une réponse vide ne montre rien ; fermer efface ; rouvrir redemande', async () => {
    const { pick, http } = boot();
    pick.open('VIE-001');
    await answer(http, []);
    expect(pick.current()).toBeNull();

    pick.close();
    pick.open('VIE-002');
    await answer(http, [STAFF_PICK]);
    expect(pick.current()).toEqual(STAFF_PICK);

    pick.close();
    TestBed.tick();
    expect(pick.current()).toBeNull();
  });

  it('ne montre pas un article déjà au panier', async () => {
    const { pick, cart, http } = boot();
    cart.add('PAI-001');
    pick.open('VIE-001');
    await answer(http, [STAFF_PICK]);

    expect(pick.current()).toBeNull();
  });
});
