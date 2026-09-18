import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { AuthFacade } from './auth.facade';
import {
  IDENTITY_LINK_REQUIRED,
  IdentityConflictNotice,
  identityConflictInterceptor,
} from './identity-conflict';

describe('identityConflictInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let logouts: number;

  beforeEach(() => {
    sessionStorage.clear();
    logouts = 0;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([identityConflictInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthFacade, useValue: { logout: (): void => void (logouts += 1) } },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    backend.verify();
    sessionStorage.clear();
  });

  function refuse(url: string, code: string): Promise<unknown> {
    const call = firstValueFrom(http.get(url)).catch((error: unknown) => error);
    backend
      .expectOne(url)
      .flush({ code, message: 'refus' }, { status: 409, statusText: 'Conflict' });
    return call;
  }

  /**
   * Régression : une connexion Google refusée laissait chaque écran afficher
   * son propre 409, sans dire pourquoi ni par où revenir (2026-09-17).
   */
  it('🔴 fait sortir la personne, et garde l’avis pour après le rechargement', async () => {
    await refuse('/me', IDENTITY_LINK_REQUIRED);

    expect(logouts).toBe(1);
    expect(TestBed.inject(IdentityConflictNotice).pending()).toBe(true);
    expect(sessionStorage.getItem('lfc-identity-link-required')).toBe('1');
  });

  it('ne fait sortir qu’une fois, même si plusieurs écrans prennent le refus', async () => {
    await refuse('/me', IDENTITY_LINK_REQUIRED);
    await refuse('/me/feature-levels', IDENTITY_LINK_REQUIRED);

    expect(logouts).toBe(1);
  });

  it('laisse passer les autres refus sans rien faire', async () => {
    await refuse('/orders', 'order.cutoff.passed');

    expect(logouts).toBe(0);
    expect(TestBed.inject(IdentityConflictNotice).pending()).toBe(false);
  });

  it('rend l’erreur à l’écran qui attendait la réponse', async () => {
    const error = await refuse('/me', IDENTITY_LINK_REQUIRED);

    expect(error).toMatchObject({ status: 409 });
  });

  it('efface l’avis une fois lu', async () => {
    await refuse('/me', IDENTITY_LINK_REQUIRED);
    const notice = TestBed.inject(IdentityConflictNotice);

    notice.dismiss();

    expect(notice.pending()).toBe(false);
    expect(sessionStorage.getItem('lfc-identity-link-required')).toBeNull();
  });
});
