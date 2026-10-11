import { HttpClient, HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpBackend } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../../../src/app/auth/auth.config';
import { DEMO_CATALOGUE } from '../demo-data/demo-catalogue';
import { PREVIEW_WORLD } from '../journeys/preview-world';
import { VISITOR_WORLD } from '../journeys/visitor-world';
import { DemoHttpBackend, PREVIEW_READ_ONLY } from './demo-http-backend';

const api = (path: string): string => `${AUTH_CONFIG.apiBaseUrl}${path}`;

describe('le backend de démonstration', () => {
  let http: HttpClient;
  let backend: DemoHttpBackend;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        DemoHttpBackend,
        { provide: HttpBackend, useExisting: DemoHttpBackend },
        { provide: PREVIEW_WORLD, useValue: VISITOR_WORLD },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(DemoHttpBackend);
  });

  it('sert les lectures du parcours depuis les données de démonstration', async () => {
    await expect(firstValueFrom(http.get(api('/shop/catalogue')))).resolves.toEqual(DEMO_CATALOGUE);
    await expect(firstValueFrom(http.get(api('/order-opening')))).resolves.toEqual(
      VISITOR_WORLD.opening,
    );
    expect(backend.unserved).toEqual([]);
  });

  it('chiffre un devis — une lecture qui porte un corps', async () => {
    const quote = await firstValueFrom(
      http.post<{ totalCents: number }>(api('/shop/quote'), {
        lines: [{ sku: DEMO_CATALOGUE.items[0]?.sku, quantity: 2 }],
        fulfillment: null,
      }),
    );

    expect(quote.totalCents).toBeGreaterThan(0);
  });

  it('refuse toute autre écriture, avec un message lisible', async () => {
    const error = await firstValueFrom(http.patch(api('/me/profile'), {})).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect(error).toMatchObject({ status: 403, error: { code: PREVIEW_READ_ONLY } });
  });

  it('retient une lecture qu’il ne sert pas, au lieu de la laisser partir', async () => {
    await firstValueFrom(http.get(api('/nulle-part'))).catch(() => null);
    await firstValueFrom(http.get('https://ailleurs.example/x')).catch(() => null);

    expect(backend.unserved.map((request) => request.url)).toEqual([
      api('/nulle-part'),
      'https://ailleurs.example/x',
    ]);
  });
});
