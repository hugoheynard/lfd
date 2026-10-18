import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { HomeSuggestionView } from '@lfd/contracts';
import type { ProductAudienceEvent } from '@lfd/contracts/shop-values';
import { of } from 'rxjs';

import { AuthFacade } from '../../../auth/auth.facade';
import type { AudienceOrigin } from '../../audience/product-audience-queue';
import { ProductAudience } from '../../audience/product-audience.service';
import { ClientCart } from '../../cart/client-cart.service';
import { provideWorkspace, workspaceDouble } from '../../client-workspace.fixture';
import { FR } from '../../copy/fr';
import { hydrateWith, TEST_CATALOGUE, TEST_ITEMS } from '../../shop/shop-catalogue.fixture';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import { StaffHomePicksRow } from './staff-home-picks';

function pick(sku: string, phrase: { fr: string } | null = null): HomeSuggestionView {
  const item = TEST_ITEMS.find((candidate) => candidate.sku === sku);
  if (item === undefined) {
    throw new RangeError(`la fixture du catalogue n’a plus de ${sku}`);
  }
  return { sku, item, reason: { source: 'staff', ruleId: '01jhome', phrase } };
}

const ROUTE = (request: { url: string }): boolean => request.url.endsWith('/shop/suggestions/home');

class RecordingAudience {
  readonly events: { sku: string; event: ProductAudienceEvent; origin: AudienceOrigin | null }[] =
    [];
  record(sku: string, event: ProductAudienceEvent, origin: AudienceOrigin | null = null): void {
    this.events.push({ sku, event, origin });
  }
}

function boot() {
  localStorage.clear();
  TestBed.resetTestingModule();
  const audience = new RecordingAudience();
  TestBed.configureTestingModule({
    imports: [StaffHomePicksRow],
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
  const cart = TestBed.inject(ClientCart);
  return { cart, http: TestBed.inject(HttpTestingController), audience };
}

/** Monte la rangée, laisse charger le morceau, répond, et rend le DOM. */
async function mount(
  http: HttpTestingController,
  views: readonly HomeSuggestionView[],
): Promise<{ readonly root: HTMLElement; readonly body: unknown }> {
  const fixture = TestBed.createComponent(StaffHomePicksRow);
  fixture.detectChanges();
  TestBed.tick();
  const asked = await vi.waitFor(() => http.expectOne(ROUTE));
  asked.flush(views);
  await new Promise((resolve) => setTimeout(resolve, 0));
  TestBed.tick();
  fixture.detectChanges();
  return { root: fixture.nativeElement as HTMLElement, body: asked.request.body };
}

describe('StaffHomePicksRow', () => {
  it('affiche « Notre sélection » : une carte par article, et compte chaque affichage', async () => {
    const { http, audience } = boot();

    const { root } = await mount(http, [pick('PAI-001'), pick('VIE-001', { fr: 'Au goûter' })]);

    const cards = root.querySelectorAll('app-staff-suggestion-card');
    expect(cards).toHaveLength(2);
    expect(cards[0]?.textContent).toContain(FR.shop.ourPicks);
    expect(cards[1]?.textContent).toContain('Au goûter');
    expect(
      audience.events.map(({ sku, event, origin }) => [sku, event, origin?.placement]),
    ).toEqual([
      ['PAI-001', 'suggestion_shown', '01jhome'],
      ['VIE-001', 'suggestion_shown', '01jhome'],
    ]);
  });

  it('demande avec le panier courant, qui n’y sert qu’à exclure', async () => {
    const { cart, http } = boot();
    cart.add('VIE-002');

    const { body } = await mount(http, []);

    expect(body).toEqual({ skus: ['VIE-002'], target: null });
  });

  it('sans règle applicable : ni rangée, ni titre', async () => {
    const { http } = boot();

    const { root } = await mount(http, []);

    expect(root.querySelector('.picks')).toBeNull();
    expect(root.textContent).not.toContain(FR.shop.ourPicks);
  });

  it('le « + » d’une carte l’ajoute, compte la règle, et la carte cède sa place', async () => {
    const { cart, http, audience } = boot();
    const { root } = await mount(http, [pick('PAI-001')]);

    root.querySelector<HTMLButtonElement>('app-staff-suggestion-card button')?.click();
    TestBed.tick();

    expect(cart.quantityOf('PAI-001')).toBe(1);
    expect(audience.events.map(({ event }) => event)).toEqual([
      'suggestion_shown',
      'suggestion_clicked',
      'suggestion_added',
      'added_to_cart',
    ]);
  });
});
