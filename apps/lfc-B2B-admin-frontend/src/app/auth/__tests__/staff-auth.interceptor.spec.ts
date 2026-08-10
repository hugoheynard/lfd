import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { B2B_API_BASE } from '../../api/api-config';
import { staffAuthInterceptor } from '../staff-auth.interceptor';
import { StaffToken } from '../staff-token';

/** Laisse résoudre le `await bearer()` avant que la requête ne parte. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function setup(token: string | null): { http: HttpClient; ctrl: HttpTestingController } {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([staffAuthInterceptor])),
      provideHttpClientTesting(),
      {
        provide: StaffToken,
        useValue: { bearer: (): Promise<string | null> => Promise.resolve(token) },
      },
    ],
  });
  return { http: TestBed.inject(HttpClient), ctrl: TestBed.inject(HttpTestingController) };
}

describe('staffAuthInterceptor', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('attache le porteur staff aux appels vers notre backend', async () => {
    const { http, ctrl } = setup('tok-staff');
    const done = http.get(`${B2B_API_BASE}/admin/orders`).subscribe();
    await flush();

    const req = ctrl.expectOne(`${B2B_API_BASE}/admin/orders`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer tok-staff');
    req.flush([]);
    done.unsubscribe();
  });

  it('laisse passer sans en-tête quand aucune session ne fournit de jeton', async () => {
    const { http, ctrl } = setup(null);
    const done = http.get(`${B2B_API_BASE}/admin/orders`).subscribe();
    await flush();

    // Le refus appartient au backend : échouer ici masquerait sa vraie réponse.
    const req = ctrl.expectOne(`${B2B_API_BASE}/admin/orders`);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush([]);
    done.unsubscribe();
  });

  it("n'offre JAMAIS le jeton à une origine étrangère", async () => {
    const { http, ctrl } = setup('tok-staff');
    const done = http.get('https://api.exemple-tiers.test/whatever').subscribe();

    // Aucun `flush()` : le chemin étranger est synchrone, preuve qu'il ne passe
    // même pas par la résolution du jeton.
    const req = ctrl.expectOne('https://api.exemple-tiers.test/whatever');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
    done.unsubscribe();
  });
});
