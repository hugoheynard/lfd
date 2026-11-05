import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { ActivationGate } from '@lfd/contracts';
import { WORKSPACE_HEADER } from '@lfd/contracts/workspace';
import { of } from 'rxjs';

import { AuthFacade } from '../auth/auth.facade';
import { ClientActivation } from './client-activation.service';
import {
  provideWorkspace,
  workspaceDouble,
  type WorkspaceDouble,
} from './client-workspace.fixture';
import { TOMMEUSES } from './mon-compte/account.fixture';

const GATE: ActivationGate = {
  canActivate: false,
  blocking: ['vat'],
  checklist: [{ piece: 'vat', blocking: true, done: false }],
};

const ACTIVATION = (r: { url: string }): boolean => r.url.endsWith('/companies/cmp_1/activation');

interface Booted {
  readonly http: HttpTestingController;
  readonly activation: ClientActivation;
  readonly workspace: WorkspaceDouble;
}

/** Un client reconnu, dans l'espace de la société suivie (`cmp_1`). */
function boot(): Booted {
  const workspace = workspaceDouble('cmp_1', [TOMMEUSES, { ...TOMMEUSES, id: 'cmp_b' }]);
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
    activation: TestBed.inject(ClientActivation),
    workspace,
  };
}

/** Le jeton, puis la requête : une microtâche avant que la requête existe. */
const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('le verdict d’activation du client', () => {
  it('lit le verdict de la société suivie, avec le jeton', async () => {
    const { http, activation } = boot();
    activation.follow(TOMMEUSES);
    await settle();

    const request = http.expectOne(ACTIVATION);
    expect(request.request.headers.get('Authorization')).toBe('Bearer jeton');
    request.flush(GATE);
    await settle();

    expect(activation.gate()).toEqual(GATE);
  });

  it('ne relit pas la même vue de société, mais relit une vue relue par `/me`', async () => {
    const { http, activation } = boot();
    activation.follow(TOMMEUSES);
    await settle();
    http.expectOne(ACTIVATION).flush(GATE);

    activation.follow(TOMMEUSES);
    await settle();
    http.expectNone(ACTIVATION);

    activation.follow({ ...TOMMEUSES });
    await settle();
    http.expectOne(ACTIVATION).flush(GATE);
  });

  it('un échec de lecture laisse le verdict à `null` — pas de synthèse, pas de page cassée', async () => {
    const { http, activation } = boot();
    activation.follow(TOMMEUSES);
    await settle();
    http.expectOne(ACTIVATION).flush(GATE);
    await settle();
    expect(activation.gate()).toEqual(GATE);

    const refreshing = activation.refresh('cmp_1');
    await settle();
    http.expectOne(ACTIVATION).flush({}, { status: 500, statusText: 'Server Error' });
    await refreshing;

    expect(activation.gate()).toBeNull();
  });

  it('`refresh` ne lit rien pour une société jamais lue', async () => {
    const { http, activation } = boot();
    await activation.refresh('cmp_1');
    http.verify();
    expect(activation.gate()).toBeNull();
  });

  /**
   * Lot d (brique par clé de contexte) : le verdict de la société quittée
   * restait à l'écran jusqu'à la réponse de la suivante — le dossier d'une
   * maison sous le nom d'une autre.
   */
  it('rien de l’ancien espace n’est rendu après une bascule', async () => {
    const { http, activation, workspace } = boot();
    activation.follow(TOMMEUSES);
    await settle();
    http.expectOne(ACTIVATION).flush(GATE);
    await settle();
    expect(activation.gate()).toEqual(GATE);

    workspace.current.set('cmp_b');
    TestBed.tick();
    expect(activation.gate()).toBeNull();

    activation.follow({ ...TOMMEUSES, id: 'cmp_b' });
    await settle();
    const next = http.expectOne((r) => r.url.endsWith('/companies/cmp_b/activation'));
    expect(next.request.headers.get(WORKSPACE_HEADER)).toBe('cmp_b');
    const other: ActivationGate = { canActivate: true, blocking: [], checklist: [] };
    next.flush(other);
    await settle();
    expect(activation.gate()).toEqual(other);
  });
});
