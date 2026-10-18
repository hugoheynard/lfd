import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { UsualSuggestionReason, UsualSuggestionView } from '@lfd/contracts';
import type { ProductAudienceEvent } from '@lfd/contracts/shop-values';
import { of } from 'rxjs';

import { AuthFacade } from '../../../auth/auth.facade';
import type { AudienceOrigin } from '../../audience/product-audience-queue';
import { ProductAudience } from '../../audience/product-audience.service';
import { ClientCart } from '../../cart/client-cart.service';
import { provideWorkspace, workspaceDouble } from '../../client-workspace.fixture';
import { FR } from '../../copy/fr';
import { TOMMEUSES } from '../../mon-compte/account.fixture';
import { hydrateWith, TEST_CATALOGUE, TEST_ITEMS } from '../../shop/shop-catalogue.fixture';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import { UsualPicksRow } from './usual-picks';

const WEEKLY: UsualSuggestionReason = { source: 'data', kind: 'weekly_rhythm', weekday: 'tue' };

function usual(sku: string, reason: UsualSuggestionReason = WEEKLY): UsualSuggestionView {
  const item = TEST_ITEMS.find((candidate) => candidate.sku === sku);
  if (item === undefined) {
    throw new RangeError(`la fixture du catalogue n’a plus de ${sku}`);
  }
  return { sku, item, reason };
}

const ROUTE = (request: { url: string }): boolean =>
  request.url.endsWith('/shop/suggestions/usuals/mine');

class RecordingAudience {
  readonly events: { sku: string; event: ProductAudienceEvent; origin: AudienceOrigin | null }[] =
    [];
  record(sku: string, event: ProductAudienceEvent, origin: AudienceOrigin | null = null): void {
    this.events.push({ sku, event, origin });
  }
}

/** Le lecteur : un pro dans sa société, un particulier en « perso », ou un invité. */
type Reader = 'pro' | 'personal' | 'guest';

function boot(reader: Reader) {
  localStorage.clear();
  TestBed.resetTestingModule();
  const audience = new RecordingAudience();
  const workspace =
    reader === 'pro' ? workspaceDouble(TOMMEUSES.id, [TOMMEUSES]) : workspaceDouble();
  TestBed.configureTestingModule({
    imports: [UsualPicksRow],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideWorkspace(workspace),
      {
        provide: AuthFacade,
        useValue: { isAuthenticated: () => reader !== 'guest', accessToken$: () => of('jeton') },
      },
      { provide: ProductAudience, useValue: audience },
    ],
  });
  hydrateWith(TestBed.inject(ShopCatalogue), TEST_CATALOGUE);
  return {
    cart: TestBed.inject(ClientCart),
    http: TestBed.inject(HttpTestingController),
    audience,
  };
}

/** Monte la rangée, laisse charger le morceau, répond, et rend le DOM. */
async function mount(
  http: HttpTestingController,
  views: readonly UsualSuggestionView[],
): Promise<{ readonly root: HTMLElement; readonly body: unknown; readonly auth: string | null }> {
  const fixture = TestBed.createComponent(UsualPicksRow);
  fixture.detectChanges();
  TestBed.tick();
  const asked = await vi.waitFor(() => http.expectOne(ROUTE));
  asked.flush(views);
  await new Promise((resolve) => setTimeout(resolve, 0));
  TestBed.tick();
  fixture.detectChanges();
  return {
    root: fixture.nativeElement as HTMLElement,
    body: asked.request.body,
    auth: asked.request.headers.get('Authorization'),
  };
}

describe('UsualPicksRow', () => {
  it('à un pro : « Vos habituels », une carte par article titrée de sa raison, et compte chaque affichage', async () => {
    const { http, audience } = boot('pro');

    const { root, auth } = await mount(http, [
      usual('PAI-001'),
      usual('VIE-001', { source: 'data', kind: 'frequent', orderCount: 6 }),
    ]);

    expect(auth).toBe('Bearer jeton');
    expect(root.querySelector('.usuals-title')?.textContent).toContain(FR.shop.usuals);
    const cards = root.querySelectorAll('app-staff-suggestion-card');
    expect(cards).toHaveLength(2);
    expect(cards[0]?.textContent).toContain('Tous les mardis');
    expect(cards[1]?.textContent).toContain('Commandé 6 fois');
    expect(
      audience.events.map(({ sku, event, origin }) => [
        sku,
        event,
        origin?.source,
        origin?.placement,
      ]),
    ).toEqual([
      ['PAI-001', 'suggestion_shown', 'data', 'weekly_rhythm'],
      ['VIE-001', 'suggestion_shown', 'data', 'frequent'],
    ]);
  });

  it('demande avec le panier courant, qui n’y sert qu’à exclure', async () => {
    const { cart, http } = boot('pro');
    cart.add('VIE-002');

    const { body } = await mount(http, []);

    expect(body).toEqual({ skus: ['VIE-002'], target: null });
  });

  it('sans habituel : ni rangée, ni titre', async () => {
    const { http } = boot('pro');

    const { root } = await mount(http, []);

    expect(root.querySelector('.usuals')).toBeNull();
    expect(root.textContent).not.toContain(FR.shop.usuals);
  });

  it('le « + » ajoute, compte suggestion_added sous data, et la carte cède sa place', async () => {
    const { cart, http, audience } = boot('pro');
    const { root } = await mount(http, [usual('PAI-001')]);

    root.querySelector<HTMLButtonElement>('app-staff-suggestion-card button.add')?.click();
    TestBed.tick();

    expect(cart.quantityOf('PAI-001')).toBe(1);
    expect(audience.events.map(({ event, origin }) => [event, origin?.placement])).toEqual([
      ['suggestion_shown', 'weekly_rhythm'],
      ['suggestion_added', 'weekly_rhythm'],
      ['added_to_cart', undefined],
    ]);
  });

  it.each<Reader>(['personal', 'guest'])('ne demande rien pour un lecteur %s', async (reader) => {
    const { http } = boot(reader);
    const fixture = TestBed.createComponent(UsualPicksRow);
    fixture.detectChanges();
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    http.expectNone(ROUTE);
    expect((fixture.nativeElement as HTMLElement).querySelector('.usuals')).toBeNull();
  });
});
