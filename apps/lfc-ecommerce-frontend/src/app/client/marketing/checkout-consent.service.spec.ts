import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { MarketingPreferenceState } from '@lfd/contracts/shop-values';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { AuthFacade } from '../../auth/auth.facade';
import { CheckoutConsent } from './checkout-consent.service';

/**
 * **La case des offres à la commande** (lot C2, règle 17) : l'invité la voit
 * TOUJOURS — son absence dirait l'état d'une adresse ; le connecté seulement
 * si sa société est `askable`.
 */
function boot(authenticated: boolean): HttpTestingController {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: AuthFacade,
        useValue: { isAuthenticated: () => authenticated, accessToken$: () => of('jeton') },
      },
    ],
  });
  return TestBed.inject(HttpTestingController);
}

async function answered(
  http: HttpTestingController,
  state: MarketingPreferenceState,
  askable: boolean,
): Promise<void> {
  TestBed.inject(CheckoutConsent).load();
  http
    .expectOne((r) => r.url.endsWith('/me/marketing'))
    .flush({ spaces: [{ space: 'lfc', state, askable }], partnersOffered: false });
  await Promise.resolve();
}

describe('CheckoutConsent', () => {
  it('l’invité voit toujours la case, sans rien lire', () => {
    const http = boot(false);
    const consent = TestBed.inject(CheckoutConsent);
    consent.load();

    expect(consent.shown()).toBe(true);
    http.verify();
  });

  it('l’invité répond même case vide : `accepted: false`', () => {
    boot(false);

    expect(TestBed.inject(CheckoutConsent).answer()).toEqual({
      accepted: false,
      textVersion: 'society.v1',
      locale: 'fr',
    });
  });

  it('le connecté `askable` voit la case', async () => {
    const http = boot(true);
    await answered(http, 'not_subscribed', true);

    expect(TestBed.inject(CheckoutConsent).shown()).toBe(true);
  });

  for (const state of ['subscribed', 'pending', 'unsubscribed'] as const) {
    it(`le connecté « ${state} » ne la voit pas, et n’envoie rien`, async () => {
      const http = boot(true);
      await answered(http, state, false);
      const consent = TestBed.inject(CheckoutConsent);
      consent.checked.set(true);

      expect(consent.shown()).toBe(false);
      expect(consent.answer()).toBeUndefined();
    });
  }

  it('le connecté dont la lecture échoue ne la voit pas', async () => {
    const http = boot(true);
    TestBed.inject(CheckoutConsent).load();
    http
      .expectOne((r) => r.url.endsWith('/me/marketing'))
      .flush('panne', { status: 500, statusText: 'Erreur' });
    await Promise.resolve();

    expect(TestBed.inject(CheckoutConsent).shown()).toBe(false);
  });

  it('après la commande, la case revient vide et `askable` sera relu', async () => {
    const http = boot(true);
    await answered(http, 'not_subscribed', true);
    const consent = TestBed.inject(CheckoutConsent);
    consent.checked.set(true);

    consent.reset();

    expect(consent.checked()).toBe(false);
    expect(consent.shown()).toBe(false);
    consent.load();
    http.expectOne((r) => r.url.endsWith('/me/marketing'));
  });
});
