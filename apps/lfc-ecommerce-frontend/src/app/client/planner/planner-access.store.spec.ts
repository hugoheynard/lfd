import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { WORKSPACE_HEADER } from '@lfd/contracts/workspace';
import { of } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';

import { AuthFacade } from '../../auth/auth.facade';
import {
  provideWorkspace,
  workspaceDouble,
  type WorkspaceDouble,
} from '../client-workspace.fixture';
import { PlannerAccessStore } from './planner-access.store';

function setUp(
  authenticated: boolean,
  workspace: WorkspaceDouble = workspaceDouble('c1'),
): { store: PlannerAccessStore; http: HttpTestingController } {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: AuthFacade,
        useValue: { isAuthenticated: signal(authenticated), accessToken$: () => of('jeton') },
      },
      provideWorkspace(workspace),
    ],
  });
  return { store: TestBed.inject(PlannerAccessStore), http: TestBed.inject(HttpTestingController) };
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const isAccess = (url: string): boolean => url.endsWith('/planner/access');

/** Le planificateur s'ouvre à une société : la réponse est celle de l'espace affiché. */
describe('PlannerAccessStore', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('demande pour l’espace affiché, avec son en-tête, et dit ouvert', async () => {
    const { store, http } = setUp(true);
    TestBed.tick();
    await settle();

    const ask = http.expectOne((r) => isAccess(r.url));
    expect(ask.request.headers.get(WORKSPACE_HEADER)).toBe('c1');
    expect(ask.request.headers.get('Authorization')).toBe('Bearer jeton');
    ask.flush({ open: true });
    await settle();

    expect(store.open()).toBe(true);
  });

  it('fermé tant que la réponse manque, et quand la lecture échoue', async () => {
    const { store, http } = setUp(true);
    TestBed.tick();
    await settle();
    expect(store.open()).toBe(false);

    http.expectOne((r) => isAccess(r.url)).flush('panne', { status: 500, statusText: 'KO' });
    await settle();

    expect(store.open()).toBe(false);
  });

  /** Changer d'espace relit : ouvert chez l'un ne dit rien de l'autre. */
  it('relit après une bascule, et ne rend jamais la réponse de l’ancien espace', async () => {
    const workspace = workspaceDouble('c1');
    const { store, http } = setUp(true, workspace);
    TestBed.tick();
    await settle();
    http.expectOne((r) => isAccess(r.url)).flush({ open: true });
    await settle();
    expect(store.open()).toBe(true);

    workspace.current.set('c2');
    TestBed.tick();
    await settle();
    expect(store.open()).toBe(false);
    const again = http.expectOne((r) => isAccess(r.url));
    expect(again.request.headers.get(WORKSPACE_HEADER)).toBe('c2');
    again.flush({ open: false });
    await settle();

    expect(store.open()).toBe(false);
  });

  it('ne demande rien pour un visiteur, et la garde lit fermé', async () => {
    const { store, http } = setUp(false);
    TestBed.tick();
    await settle();

    http.expectNone((r) => isAccess(r.url));
    await expect(store.openHere()).resolves.toBe(false);
  });

  it('la garde reprend la lecture de l’espace affiché, sans second appel', async () => {
    const { store, http } = setUp(true);
    TestBed.tick();
    await settle();
    const answer = store.openHere();
    http.expectOne((r) => isAccess(r.url)).flush({ open: true });

    await expect(answer).resolves.toBe(true);
  });
});
