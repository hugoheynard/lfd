import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import type { CartSuggestionView } from '@lfd/contracts';
import type { ProductAudienceEvent } from '@lfd/contracts/shop-values';
import { of } from 'rxjs';

import { AuthFacade } from '../../auth/auth.facade';
import type { AudienceOrigin } from '../audience/product-audience-queue';
import { ProductAudience } from '../audience/product-audience.service';
import { CartEntries } from '../cart/cart-entries';
import { ClientCart } from '../cart/client-cart.service';
import { provideWorkspace, workspaceDouble } from '../client-workspace.fixture';
import { hydrateWith, TEST_CATALOGUE, TEST_ITEMS } from '../shop/shop-catalogue.fixture';
import { ShopCatalogue } from '../shop/shop-catalogue.store';

/** La suggestion du panier que le serveur rend après un ajout. */
export function cartPick(sku: string): CartSuggestionView {
  const item = TEST_ITEMS.find((candidate) => candidate.sku === sku);
  if (item === undefined) {
    throw new RangeError(`la fixture du catalogue n’a plus de ${sku}`);
  }
  return { sku, item, reason: { source: 'staff', ruleId: '01jcart', phrase: null } };
}

export const CART_ROUTE = (request: { url: string }): boolean =>
  request.url.endsWith('/shop/suggestions/cart');

export class RecordingAudience {
  readonly events: { sku: string; event: ProductAudienceEvent; origin: AudienceOrigin | null }[] =
    [];
  record(sku: string, event: ProductAudienceEvent, origin: AudienceOrigin | null = null): void {
    this.events.push({ sku, event, origin });
  }
}

/** Un panier hydraté, un visiteur, des compteurs enregistrés — rien d'autre de doublé. */
export function bootAfterAdd(imports: readonly unknown[] = []) {
  localStorage.clear();
  TestBed.resetTestingModule();
  const audience = new RecordingAudience();
  TestBed.configureTestingModule({
    imports: [...imports],
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
    cart: TestBed.inject(ClientCart),
    entries: TestBed.inject(CartEntries),
    http: TestBed.inject(HttpTestingController),
    audience,
  };
}

/** Zoneless : on pousse l'effet, on laisse charger le morceau, le serveur répond. */
export async function answerCart(
  http: HttpTestingController,
  views: readonly CartSuggestionView[],
): Promise<unknown> {
  TestBed.tick();
  const asked = await firstRequest(http);
  asked.flush(views);
  await new Promise((resolve) => setTimeout(resolve, 0));
  TestBed.tick();
  return asked.request.body;
}

/** Deux secondes au plus : le morceau se charge lentement quand toute la suite tourne. */
const WAIT_TURNS = 200;
const WAIT_STEP_MS = 10;

/** La requête part après le chargement du morceau : on attend qu'elle paraisse, sans minuterie de test. */
async function firstRequest(http: HttpTestingController): Promise<TestRequest> {
  for (let turn = 0; turn < WAIT_TURNS; turn += 1) {
    TestBed.tick();
    const [asked] = http.match(CART_ROUTE);
    if (asked !== undefined) {
      return asked;
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS));
  }
  return http.expectOne(CART_ROUTE);
}
