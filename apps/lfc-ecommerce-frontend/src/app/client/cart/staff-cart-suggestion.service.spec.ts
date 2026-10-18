import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { CartSuggestionView } from '@lfd/contracts';
import type { ProductAudienceEvent } from '@lfd/contracts/shop-values';
import { of } from 'rxjs';

import { AuthFacade } from '../../auth/auth.facade';
import type { AudienceOrigin } from '../audience/product-audience-queue';
import { ProductAudience } from '../audience/product-audience.service';
import { provideWorkspace, workspaceDouble } from '../client-workspace.fixture';
import { hydrateWith, TEST_CATALOGUE, TEST_ITEMS } from '../shop/shop-catalogue.fixture';
import { ShopCatalogue } from '../shop/shop-catalogue.store';
import { ClientCart } from './client-cart.service';
import { CART_SUGGESTION_DEBOUNCE_MS, StaffCartSuggestion } from './staff-cart-suggestion.service';

const BAGUETTE = TEST_ITEMS.find((item) => item.sku === 'PAI-001');
if (BAGUETTE === undefined) {
  throw new RangeError('la fixture du catalogue n’a plus de PAI-001');
}

const STAFF_PICK: CartSuggestionView = {
  sku: 'PAI-001',
  item: BAGUETTE,
  reason: { source: 'staff', ruleId: '01jrule', phrase: { fr: 'Avec un croissant, la baguette' } },
};

const ROUTE = (request: { url: string }): boolean => request.url.endsWith('/shop/suggestions/cart');

/** Les gestes comptés, sans file ni réseau. */
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
    pick: TestBed.inject(StaffCartSuggestion),
    cart: TestBed.inject(ClientCart),
    http: TestBed.inject(HttpTestingController),
    audience,
  };
}

/** Zoneless : on pousse les effets, on avance l'anti-rebond, on laisse charger le morceau. */
async function settle(): Promise<void> {
  TestBed.tick();
  await vi.advanceTimersByTimeAsync(CART_SUGGESTION_DEBOUNCE_MS);
  TestBed.tick();
}

async function answer(
  http: HttpTestingController,
  views: readonly CartSuggestionView[],
): Promise<unknown> {
  const asked = await vi.waitFor(() => http.expectOne(ROUTE));
  asked.flush(views);
  await vi.advanceTimersByTimeAsync(0);
  TestBed.tick();
  return asked.request.body;
}

describe('StaffCartSuggestion', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ne demande rien tant que le panier n’est pas ouvert', async () => {
    const { http } = boot();
    await settle();

    http.expectNone(ROUTE);
  });

  it('demande UNE fois pour une salve de gestes, avec le panier, et compte l’affichage une fois', async () => {
    const { pick, cart, http, audience } = boot();
    pick.open();
    cart.add('VIE-001');
    cart.add('VIE-001');
    cart.add('VIE-002');
    await settle();

    const body = await answer(http, [STAFF_PICK]);

    expect(body).toEqual({ skus: ['VIE-001', 'VIE-002'], target: null });
    expect(pick.current()).toEqual(STAFF_PICK);
    TestBed.tick();
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
    pick.open();
    await settle();
    await answer(http, [STAFF_PICK]);

    pick.taken(STAFF_PICK);

    expect(audience.events.map(({ event, origin }) => [event, origin?.placement])).toEqual([
      ['suggestion_shown', '01jrule'],
      ['suggestion_clicked', '01jrule'],
      ['suggestion_added', '01jrule'],
    ]);
  });

  it('ne montre plus l’article une fois au panier, et une liste vide ne montre rien', async () => {
    const { pick, cart, http } = boot();
    pick.open();
    await settle();
    await answer(http, [STAFF_PICK]);

    cart.add('PAI-001');
    expect(pick.current()).toBeNull();
    await settle();
    await answer(http, []);
    expect(pick.current()).toBeNull();
  });

  it('un échec laisse la relance : aucune suggestion', async () => {
    const { pick, http } = boot();
    pick.open();
    await settle();
    const asked = await vi.waitFor(() => http.expectOne(ROUTE));
    asked.flush('panne', { status: 500, statusText: 'Server Error' });
    await vi.advanceTimersByTimeAsync(0);

    expect(pick.current()).toBeNull();
  });
});
