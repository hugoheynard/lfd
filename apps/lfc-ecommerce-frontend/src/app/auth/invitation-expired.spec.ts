import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { AuthFacade } from './auth.facade';
import {
  INVITATION_EXPIRED,
  InvitationExpiredNotice,
  invitationExpiredInterceptor,
} from './invitation-expired';

const MESSAGE =
  'Votre invitation a expiré. Demandez un nouvel accès à votre interlocuteur La Folie Coffee.';

describe('invitationExpiredInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let logouts: number;

  beforeEach(() => {
    sessionStorage.clear();
    logouts = 0;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([invitationExpiredInterceptor])),
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
      .flush({ code, message: MESSAGE }, { status: 403, statusText: 'Forbidden' });
    return call;
  }

  /**
   * Régression : une invitation expirée laissait la session ouverte, et chaque
   * écran affichait son propre 403 (2026-10-10).
   */
  it('🔴 fait sortir la personne, et garde le message du serveur', async () => {
    await refuse('/me', INVITATION_EXPIRED);

    expect(logouts).toBe(1);
    expect(TestBed.inject(InvitationExpiredNotice).pending()).toBe(MESSAGE);
    expect(sessionStorage.getItem('lfc-invitation-expired')).toBe(MESSAGE);
  });

  it('ne fait sortir qu’une fois, même si plusieurs écrans prennent le refus', async () => {
    await refuse('/me', INVITATION_EXPIRED);
    await refuse('/me/feature-levels', INVITATION_EXPIRED);

    expect(logouts).toBe(1);
  });

  it('laisse passer un autre 403 sans rien faire', async () => {
    await refuse('/orders', 'account.forbidden');

    expect(logouts).toBe(0);
    expect(TestBed.inject(InvitationExpiredNotice).pending()).toBeNull();
  });

  it('rend l’erreur à l’écran qui attendait la réponse', async () => {
    const error = await refuse('/me', INVITATION_EXPIRED);

    expect(error).toMatchObject({ status: 403 });
  });

  it('efface l’avis une fois lu', async () => {
    await refuse('/me', INVITATION_EXPIRED);
    const notice = TestBed.inject(InvitationExpiredNotice);

    expect(notice.take()).toBe(MESSAGE);
    expect(notice.pending()).toBeNull();
    expect(sessionStorage.getItem('lfc-invitation-expired')).toBeNull();
  });
});
