import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { AuthFacade } from './auth.facade';
import { sessionExpiredInterceptor } from './session-expired';
import { expiringOnFailure } from './token-failure';

describe('La session expirée', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let auth: AuthFacade;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([sessionExpiredInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthFacade);
  });

  it('un jeton silencieux qui échoue pose `expired` et REJETTE, sans pendre', async () => {
    let expired = false;
    const failure = { error: 'invalid_grant' };
    const token$ = expiringOnFailure(
      throwError(() => failure),
      () => (expired = true),
    );

    await expect(firstValueFrom(token$)).rejects.toBe(failure);
    expect(expired).toBe(true);
  });

  it('un jeton obtenu ne touche pas à la session', async () => {
    let expired = false;
    const token$ = expiringOnFailure(of('jeton'), () => (expired = true));

    await expect(firstValueFrom(token$)).resolves.toBe('jeton');
    expect(expired).toBe(false);
  });

  it('un 401 sur un appel authentifié pose `expired`, et l’erreur continue sa route', async () => {
    const call = firstValueFrom(
      http.get('/api/orders/mine', { headers: { Authorization: 'Bearer périmé' } }),
    );
    backend.expectOne('/api/orders/mine').flush(null, { status: 401, statusText: 'Unauthorized' });

    await expect(call).rejects.toMatchObject({ status: 401 });
    expect(auth.sessionExpired()).toBe(true);
  });

  it('un 401 sur un appel ANONYME n’est pas une session expirée', async () => {
    const call = firstValueFrom(http.get('/api/catalogue'));
    backend.expectOne('/api/catalogue').flush(null, { status: 401, statusText: 'Unauthorized' });

    await expect(call).rejects.toMatchObject({ status: 401 });
    expect(auth.sessionExpired()).toBe(false);
  });

  it('un 500 n’est pas une session expirée', async () => {
    const call = firstValueFrom(
      http.get('/api/orders/mine', { headers: { Authorization: 'Bearer valide' } }),
    );
    backend.expectOne('/api/orders/mine').flush(null, { status: 500, statusText: 'Erreur' });

    await expect(call).rejects.toMatchObject({ status: 500 });
    expect(auth.sessionExpired()).toBe(false);
  });
});
