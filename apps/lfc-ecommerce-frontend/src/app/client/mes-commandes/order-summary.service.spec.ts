import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { provideRecognised } from '../client-orders.fixture';
import { NO_DAYS } from './client-order-history.service';
import { OrderSummaryRefused, OrderSummaryService } from './order-summary.service';
import { SUMMARY } from './order-summary.fixture';

/** Les microtâches du jeton passées, la requête est partie. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve));

/**
 * jsdom n'a pas `Blob.text()`, que tout navigateur porte : le corps d'un refus
 * demandé en blob ne se relirait pas ici. Posé le temps de la suite, retiré après.
 */
const nativeText = Object.getOwnPropertyDescriptor(Blob.prototype, 'text');
beforeAll(() => {
  if (nativeText === undefined) {
    Object.defineProperty(Blob.prototype, 'text', {
      configurable: true,
      value(this: Blob): Promise<string> {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.readAsText(this);
        });
      },
    });
  }
});
afterAll(() => {
  if (nativeText === undefined) {
    Reflect.deleteProperty(Blob.prototype, 'text');
  }
});

describe('OrderSummaryService — le récapitulatif au serveur (plan du récapitulatif, R3)', () => {
  let http: HttpTestingController;
  let service: OrderSummaryService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRecognised()],
    });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(OrderSummaryService);
  });

  const summaryRequest = () =>
    http.expectOne((r) => r.url.endsWith('/companies/co_1/orders/summary'));

  it('envoie les ids en JSON, sans période quand aucune borne n’est posée', async () => {
    const pending = service.summarize({
      companyId: 'co_1',
      orderIds: ['o1', 'o2'],
      period: NO_DAYS,
    });
    await settle();
    const request = summaryRequest();
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ orderIds: ['o1', 'o2'], format: 'json' });
    request.flush(SUMMARY);
    await expect(pending).resolves.toEqual(SUMMARY);
  });

  it('PDF : la même sélection, la période affichée, le nom du serveur', async () => {
    const pending = service.file(
      { companyId: 'co_1', orderIds: ['o1'], period: { from: '2026-10-01', to: null } },
      'pdf',
    );
    await settle();
    const request = summaryRequest();
    expect(request.request.body).toEqual({
      orderIds: ['o1'],
      format: 'pdf',
      period: { from: '2026-10-01' },
    });
    request.flush(new Blob(['%PDF']), {
      headers: {
        'Content-Disposition': 'attachment; filename="recapitulatif-maison-2026-10-21.pdf"',
      },
    });
    expect((await pending).fileName).toBe('recapitulatif-maison-2026-10-21.pdf');
  });

  it('un en-tête illisible : le nom de repli', async () => {
    const pending = service.file({ companyId: 'co_1', orderIds: ['o1'], period: NO_DAYS }, 'csv');
    await settle();
    summaryRequest().flush(new Blob(['a;b']));
    expect((await pending).fileName).toBe('recapitulatif.csv');
  });

  it('un refus remonte avec SON message — en JSON comme en blob', async () => {
    const json = service.summarize({ companyId: 'co_1', orderIds: ['o9'], period: NO_DAYS });
    await settle();
    summaryRequest().flush(
      { message: 'Commande introuvable : o9' },
      { status: 404, statusText: 'Not Found' },
    );
    await expect(json).rejects.toEqual(new OrderSummaryRefused('Commande introuvable : o9'));

    const file = service.file({ companyId: 'co_1', orderIds: ['o9'], period: NO_DAYS }, 'pdf');
    await settle();
    summaryRequest().flush(new Blob([JSON.stringify({ message: 'Au plus 200 commandes' })]), {
      status: 400,
      statusText: 'Bad Request',
    });
    await expect(file).rejects.toEqual(new OrderSummaryRefused('Au plus 200 commandes'));
  });
});
