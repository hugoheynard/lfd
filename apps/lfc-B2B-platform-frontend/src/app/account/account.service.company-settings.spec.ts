import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { FulfillmentPreferenceView } from '@lfd/contracts';
import { of } from 'rxjs';

import { AuthFacade } from '../auth/auth.facade';
import { NotifyService } from '../notify.service';
import { AccountService } from './account.service';

/**
 * Les deux réglages de société que `/mon-compte` écrit dans un panneau : la
 * DEMANDE de crédit et l'habitude de service. Tenus à part de
 * `account.service.spec.ts`, que les écritures de contacts et de profil
 * remplissent en parallèle.
 */
describe('AccountService — réglages de société à refus rendu', () => {
  let account: AccountService;
  let http: HttpTestingController;
  let toasts: { success: string[]; error: unknown[] };

  beforeEach(() => {
    toasts = { success: [], error: [] };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthFacade,
          useValue: {
            isAuthenticated: signal(false),
            authEmail: signal(null),
            accessToken$: () => of('jeton'),
          },
        },
        {
          provide: NotifyService,
          useValue: {
            success: (message: string) => toasts.success.push(message),
            error: (error: unknown) => toasts.error.push(error),
          },
        },
      ],
    });
    account = TestBed.inject(AccountService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  /** Une habitude complète, socle de signature compris : il doit partir tel quel. */
  const PREFERENCE: FulfillmentPreferenceView = {
    method: 'pickup',
    pickupAddressId: 'pk_2',
    deliveryAddressId: null,
    signatureRequired: true,
  };

  const CASES = [
    {
      name: 'askPaymentTerm',
      call: (): Promise<string | null> => account.askPaymentTerm('cmp_1', 'monthly'),
      path: '/companies/cmp_1/payment-term',
      body: { paymentTerm: 'monthly' },
      toast: 'Demande de règlement enregistrée.',
    },
    {
      name: 'saveFulfillment',
      call: (): Promise<string | null> => account.saveFulfillment('cmp_1', PREFERENCE),
      path: '/companies/cmp_1/fulfillment-preference',
      body: PREFERENCE,
      toast: "Préférence d'acheminement enregistrée.",
    },
  ] as const;

  for (const c of CASES) {
    describe(c.name, () => {
      const request = () => http.expectOne((r) => r.url.endsWith(c.path));

      it(`émet PATCH ${c.path} avec le corps exact et le jeton`, async () => {
        const outcome = c.call();
        const sent = request();
        expect(sent.request.method).toBe('PATCH');
        expect(sent.request.body).toEqual(c.body);
        expect(sent.request.headers.get('Authorization')).toBe('Bearer jeton');

        sent.flush(null, { status: 204, statusText: 'No Content' });
        await outcome;
        http.expectOne((r) => r.url.endsWith('/me') && r.method === 'GET');
      });

      it('rend `null` au succès, toaste la réussite et relit `/me`', async () => {
        const outcome = c.call();
        request().flush(null, { status: 204, statusText: 'No Content' });

        await expect(outcome).resolves.toBeNull();
        expect(toasts.success).toEqual([c.toast]);
        expect(toasts.error).toEqual([]);
        http.expectOne((r) => r.url.endsWith('/me') && r.method === 'GET');
      });

      it('rend le message du serveur à l’échec, sans relire `/me` ni toucher au statut', async () => {
        const outcome = c.call();
        request().flush(
          { code: 'account.company.admin_required', message: 'Réservé au gestionnaire.' },
          { status: 403, statusText: 'Forbidden' },
        );

        await expect(outcome).resolves.toBe('Réservé au gestionnaire.');
        expect(toasts.success).toEqual([]);
        expect(toasts.error.length).toBe(1);
        http.expectNone((r) => r.url.endsWith('/me'));
        // Le panneau ouvert n'est pas détruit : `/mon-compte` ne quitte pas `ready`.
        expect(account.status()).toBe('idle');
      });
    });
  }

  /** Le refactor partage la requête : l'ancienne écriture de la fiche « Mes entreprises » ne bouge pas. */
  it('requestSettlementMean vise toujours la même route, avec le même corps', () => {
    account.requestSettlementMean('cmp_1', 'monthly');
    const sent = http.expectOne((r) => r.url.endsWith('/companies/cmp_1/payment-term'));
    expect(sent.request.method).toBe('PATCH');
    expect(sent.request.body).toEqual({ paymentTerm: 'monthly' });
    sent.flush(null);
    http.expectOne((r) => r.url.endsWith('/me'));
  });

  it('preferFulfillment vise toujours la même route, et rend `true` au succès', async () => {
    const outcome = account.preferFulfillment('cmp_1', PREFERENCE);
    const sent = http.expectOne((r) => r.url.endsWith('/companies/cmp_1/fulfillment-preference'));
    expect(sent.request.body).toEqual(PREFERENCE);
    sent.flush(null);

    await expect(outcome).resolves.toBe(true);
    http.expectOne((r) => r.url.endsWith('/me'));
  });
});
