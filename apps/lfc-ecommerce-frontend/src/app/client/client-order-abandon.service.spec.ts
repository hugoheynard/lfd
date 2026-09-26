import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { AuthFacade } from '../auth/auth.facade';
import { type AbandonOutcome, ClientOrderAbandon } from './client-order-abandon.service';
import { provideRecognised, RECOGNISED } from './client-orders.fixture';

/** Tente l'abandon et répond à la place du serveur. */
async function answer(reply: (http: HttpTestingController) => void): Promise<AbandonOutcome> {
  const pending = TestBed.inject(ClientOrderAbandon).abandon('ord_9');
  await Promise.resolve();
  await Promise.resolve();
  reply(TestBed.inject(HttpTestingController));
  return pending;
}

const refuse =
  (code: string, status = 409) =>
  (http: HttpTestingController) =>
    http
      .expectOne((req) => req.url.endsWith('/orders/ord_9/abandon'))
      .flush({ code, message: '…' }, { status, statusText: 'Refus' });

/**
 * L'écran navigue quoi qu'il arrive ; ce service ne lui dit que QUOI ANNONCER.
 * Chaque code du serveur (`order-abandon-errors.ts`) a sa ligne.
 */
describe('ClientOrderAbandon', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRecognised()],
    });
  });

  it('rend `abandoned` sur un 204, après un POST porteur du jeton', async () => {
    const outcome = await answer((http) => {
      const req = http.expectOne((r) => r.url.endsWith('/orders/ord_9/abandon'));
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('Authorization')).toBe('Bearer jeton-de-test');
      req.flush(null, { status: 204, statusText: 'No Content' });
    });

    expect(outcome).toBe('abandoned');
  });

  it.each([
    'orders.abandon.already_paid',
    'orders.abandon.payment_in_progress',
    'orders.abandon.not_abandonable',
  ])('ne dit jamais « annulée » quand le serveur refuse en %s', async (code) => {
    expect(await answer(refuse(code))).toBe('settled');
  });

  it.each([
    ['orders.abandon.provider_unavailable', 409],
    ['orders.abandon.not_author', 403],
  ])('rend `unsettled` sur %s : rien n’est écrit', async (code, status) => {
    expect(await answer(refuse(code, status))).toBe('unsettled');
  });

  it('rend `unsettled` quand le réseau tombe', async () => {
    const outcome = await answer((http) =>
      http
        .expectOne((r) => r.url.endsWith('/orders/ord_9/abandon'))
        .error(new ProgressEvent('error'), { status: 0 }),
    );

    expect(outcome).toBe('unsettled');
  });

  it('n’appelle rien pour un visiteur sans compte', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthFacade, useValue: { ...RECOGNISED, isAuthenticated: () => false } },
      ],
    });

    const outcome = await TestBed.inject(ClientOrderAbandon).abandon('ord_9');

    expect(outcome).toBe('unsettled');
    TestBed.inject(HttpTestingController).verify();
  });
});
