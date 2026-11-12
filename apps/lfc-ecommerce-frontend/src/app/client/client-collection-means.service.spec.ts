import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AuthFacade } from '../auth/auth.facade';
import { ClientCollectionMeans } from './client-collection-means.service';
import { provideWorkspace, workspaceDouble } from './client-workspace.fixture';
import { TOMMEUSES } from './mon-compte/account.fixture';

const MEANS = (r: { url: string }): boolean => r.url.endsWith('/companies/cmp_1/collection-means');

/** Un client reconnu, dans l'espace de la société suivie (`cmp_1`). */
function boot(): { readonly http: HttpTestingController; readonly means: ClientCollectionMeans } {
  const workspace = workspaceDouble('cmp_1', [TOMMEUSES]);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: AuthFacade,
        useValue: { isAuthenticated: () => true, accessToken$: () => of('jeton') },
      },
      provideWorkspace(workspace),
    ],
  });
  return {
    http: TestBed.inject(HttpTestingController),
    means: TestBed.inject(ClientCollectionMeans),
  };
}

/** Le jeton, puis la requête : une microtâche avant que la requête existe. */
const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('le moyen d’encaissement du client', () => {
  it('lit le moyen de la société suivie, avec le jeton', async () => {
    const { http, means } = boot();
    means.follow(TOMMEUSES);
    await settle();

    const request = http.expectOne(MEANS);
    expect(request.request.headers.get('Authorization')).toBe('Bearer jeton');
    request.flush({ means: 'bank_transfer' });
    await settle();

    expect(means.means()).toBe('bank_transfer');
  });

  it('un échec de lecture n’affirme aucun moyen', async () => {
    const { http, means } = boot();
    means.follow(TOMMEUSES);
    await settle();

    http.expectOne(MEANS).flush('non', { status: 500, statusText: 'Erreur' });
    await settle();

    expect(means.means()).toBeNull();
  });
});
