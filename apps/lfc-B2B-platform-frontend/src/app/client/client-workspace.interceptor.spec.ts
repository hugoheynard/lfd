import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PERSONAL_WORKSPACE, WORKSPACE_HEADER } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  provideWorkspace,
  workspaceDouble,
  type WorkspaceDouble,
} from './client-workspace.fixture';
import { targetsApi, workspaceInterceptorFor } from './client-workspace.interceptor';

/**
 * Régression (2026-09-15) : la suite lisait `AUTH_CONFIG.apiBaseUrl`, qui vient
 * du `.env` du poste — vide en CI, où trois cas rougissaient alors que le code
 * était juste. La racine est désormais celle de la suite, et de personne d'autre.
 */
const API = 'https://api.suite.test';

function boot(current: string | null): {
  http: HttpClient;
  backend: HttpTestingController;
  workspace: WorkspaceDouble;
} {
  const workspace = workspaceDouble(current);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([workspaceInterceptorFor(API)])),
      provideHttpClientTesting(),
      provideWorkspace(workspace),
    ],
  });
  return {
    http: TestBed.inject(HttpClient),
    backend: TestBed.inject(HttpTestingController),
    workspace,
  };
}

describe('workspaceInterceptor', () => {
  it('pose l’espace connu sur une requête vers l’API', () => {
    const { http, backend } = boot('cmp_a');

    http.get(`${API}/shop/catalogue/mine`).subscribe();

    expect(
      backend.expectOne(`${API}/shop/catalogue/mine`).request.headers.get(WORKSPACE_HEADER),
    ).toBe('cmp_a');
  });

  it('pose aussi le perso, qui se déclare', () => {
    const { http, backend } = boot(PERSONAL_WORKSPACE);

    http.get(`${API}/orders/mine`).subscribe();

    expect(backend.expectOne(`${API}/orders/mine`).request.headers.get(WORKSPACE_HEADER)).toBe(
      PERSONAL_WORKSPACE,
    );
  });

  /** L'appartenance à une société ne regarde ni Auth0, ni Stripe, ni un CDN. */
  it('ne pose rien vers un autre hôte', () => {
    const { http, backend } = boot('cmp_a');

    http.get('https://lafoliedouce.eu.auth0.com/userinfo').subscribe();

    expect(
      backend
        .expectOne('https://lafoliedouce.eu.auth0.com/userinfo')
        .request.headers.has(WORKSPACE_HEADER),
    ).toBe(false);
  });

  /** Vitruve B2 : avant `/me`, un espace deviné vaut moins que pas d'espace. */
  it('ne pose rien tant que l’espace n’est pas connu', () => {
    const { http, backend, workspace } = boot(null);

    http.get(`${API}/me`).subscribe();
    expect(backend.expectOne(`${API}/me`).request.headers.has(WORKSPACE_HEADER)).toBe(false);

    workspace.current.set('cmp_a');
    http.get(`${API}/shop/cart`).subscribe();
    expect(backend.expectOne(`${API}/shop/cart`).request.headers.get(WORKSPACE_HEADER)).toBe(
      'cmp_a',
    );
  });

  /** L'écriture du panier pose l'espace CAPTURÉ au geste : on ne le remplace pas par celui de l'envoi. */
  it('respecte un en-tête déjà posé', () => {
    const { http, backend } = boot('cmp_b');

    http.put(`${API}/shop/cart`, {}, { headers: { [WORKSPACE_HEADER]: 'cmp_a' } }).subscribe();

    expect(backend.expectOne(`${API}/shop/cart`).request.headers.get(WORKSPACE_HEADER)).toBe(
      'cmp_a',
    );
  });
});

describe('targetsApi', () => {
  it('reconnaît la racine et ses chemins, pas un hôte qui la prolonge', () => {
    expect(targetsApi('https://api.exemple.fr/me', 'https://api.exemple.fr/')).toBe(true);
    expect(targetsApi('https://api.exemple.fr', 'https://api.exemple.fr')).toBe(true);
    expect(targetsApi('https://api.exemple.fr.ailleurs.net/me', 'https://api.exemple.fr')).toBe(
      false,
    );
  });

  it('une racine vide ne vise rien', () => {
    expect(targetsApi('/me', '')).toBe(false);
  });
});
