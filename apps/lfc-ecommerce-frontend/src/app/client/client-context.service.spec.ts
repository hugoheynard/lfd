import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PERSONAL_WORKSPACE, WORKSPACE_HEADER, type CompanyView } from '@lfd/contracts';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Account } from '../account/account.model';
import { AccountService } from '../account/account.service';
import { AuthFacade } from '../auth/auth.facade';
import { NotifyService } from '../notify.service';
import { ClientContext, VISITOR } from './client-context.service';
import { ClientWorkspace } from './client-workspace.service';
import { PROFILE, TOMMEUSES } from './mon-compte/account.fixture';
import { PickupListGateway } from './shop/pickup-list.gateway';
import { ShopCatalogue } from './shop/shop-catalogue.store';
import { ShopStorefront } from './shop/storefront/shop-storefront.store';
import {
  provideWorkspace,
  workspaceDouble,
  type WorkspaceDouble,
} from './client-workspace.fixture';

describe('ClientContext — le contexte de lecture', () => {
  const authenticated = signal(false);
  let workspace: WorkspaceDouble;

  function setUp(platform: 'browser' | 'server' = 'browser'): ClientContext {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthFacade, useValue: { isAuthenticated: authenticated } },
        provideWorkspace(workspace),
        { provide: PLATFORM_ID, useValue: platform },
      ],
    });
    return TestBed.inject(ClientContext);
  }

  beforeEach(() => {
    authenticated.set(false);
    workspace = workspaceDouble(null);
  });

  it('sans session, est visiteur, préfixe « visiteur »', () => {
    const context = setUp();
    expect(context.state()).toEqual({ kind: 'visitor' });
    expect(context.prefix()).toBe(VISITOR);
  });

  it('reconnu avant /me, est inconnu et n’a pas de préfixe', () => {
    authenticated.set(true);
    const context = setUp();
    expect(context.state()).toEqual({ kind: 'unknown' });
    expect(context.prefix()).toBeNull();
  });

  it('passe d’inconnu à confirmé quand /me donne l’espace', () => {
    authenticated.set(true);
    const context = setUp();
    workspace.current.set('cmp_1');
    expect(context.state()).toEqual({ kind: 'confirmed', workspace: 'cmp_1' });
    expect(context.prefix()).toBe('cmp_1');
    workspace.current.set(PERSONAL_WORKSPACE);
    expect(context.prefix()).toBe(PERSONAL_WORKSPACE);
  });

  it('à la déconnexion, redevient visiteur même si un espace reste en mémoire', () => {
    authenticated.set(true);
    workspace.current.set('cmp_1');
    const context = setUp();
    authenticated.set(false);
    expect(context.prefix()).toBe(VISITOR);
  });

  it('se résout pareil au rendu serveur, sans rien lire du navigateur', () => {
    authenticated.set(true);
    const context = setUp('server');
    expect(context.prefix()).toBeNull();
    workspace.current.set('cmp_1');
    expect(context.state()).toEqual({ kind: 'confirmed', workspace: 'cmp_1' });
  });

  it('pendant une bascule, garde le préfixe de l’espace quitté', () => {
    authenticated.set(true);
    workspace.current.set('cmp_1');
    const context = setUp();
    workspace.current.set(PERSONAL_WORKSPACE);
    workspace.switching.set({ from: 'cmp_1', to: PERSONAL_WORKSPACE });
    expect(context.state()).toEqual({ kind: 'switching', from: 'cmp_1', to: PERSONAL_WORKSPACE });
    expect(context.prefix()).toBe('cmp_1');
    expect(context.switching()).toBe(true);
    workspace.switching.set(null);
    expect(context.prefix()).toBe(PERSONAL_WORKSPACE);
    expect(context.switching()).toBe(false);
  });

  it('à l’arrivée pro d’une connexion, n’a aucun espace à proposer avant l’acceptation', () => {
    authenticated.set(true);
    workspace.current.set('cmp_1');
    workspace.switching.set({ from: null, to: 'cmp_1' });
    const context = setUp();
    expect(context.prefix()).toBeNull();
  });
});

/**
 * La bascule de bout en bout, contre le VRAI compte et le vrai espace : c'est
 * le `PATCH` de la préférence qui dit « accepté », et les trois lecteurs du
 * lot b ne doivent rien lire ni montrer de l'espace demandé avant lui.
 */
describe('ClientContext — la bascule (lot c)', () => {
  const MAISON_A: CompanyView = { ...TOMMEUSES, id: 'cmp_a', enseigne: 'Maison A' };
  const MAISON_B: CompanyView = { ...TOMMEUSES, id: 'cmp_b', enseigne: 'Maison B' };
  const PAGE = { shelfKey: 'pains', items: [] };

  let http: HttpTestingController;
  let context: ClientContext;

  function me(workspace: string): Account {
    return {
      profile: PROFILE,
      companies: [MAISON_A, MAISON_B],
      reachableSites: [],
      navPrefs: { catalogueView: null, workspace },
    };
  }

  function patches(): TestRequest[] {
    return http.match((r) => r.url.endsWith('/me/nav-prefs'));
  }

  function storefrontReads(): TestRequest[] {
    return http.match((r) => r.url.endsWith('/shop/storefront/pains/mine'));
  }

  const headerOf = (request: TestRequest): string | null =>
    request.request.headers.get(WORKSPACE_HEADER);

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: AuthFacade,
          useValue: {
            isAuthenticated: signal(true),
            authEmail: signal(null),
            accessToken$: () => of('jeton'),
          },
        },
        { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AccountService).load();
    http.expectOne((r) => r.url.endsWith('/me') && r.method === 'GET').flush(me('cmp_a'));
    context = TestBed.inject(ClientContext);
  });

  async function readShelfInA(store: ShopStorefront): Promise<void> {
    const loading = store.load('pains');
    const [read] = storefrontReads();
    expect(read === undefined ? null : headerOf(read)).toBe('cmp_a');
    read?.flush(PAGE);
    await loading;
  }

  const EMPTY_CATALOGUE = { shelves: [], items: [], operations: [] };
  const PERSONAL_PAGE = { shelfKey: 'pains', items: [{ sku: 'perso' }] };

  /** Les lectures parties pour un espace, quelle que soit la route. */
  const readsFor = (workspace: string): TestRequest[] =>
    http.match((r) => r.headers.get(WORKSPACE_HEADER) === workspace);

  it('acceptée : la page de l’espace demandé part AVANT la réponse du serveur, et ne se montre qu’à l’acceptation', async () => {
    const store = TestBed.inject(ShopStorefront);
    await readShelfInA(store);

    const outcome = context.switchTo(PERSONAL_WORKSPACE);
    TestBed.tick();
    expect(context.state()).toEqual({ kind: 'switching', from: 'cmp_a', to: PERSONAL_WORKSPACE });
    expect(context.prefix()).toBe('cmp_a');
    expect(context.ahead()).toBe(PERSONAL_WORKSPACE);
    // L'en-tête optimiste reste pour les autres stores ; le lecteur, lui, montre A.
    expect(TestBed.inject(ClientWorkspace).current()).toBe(PERSONAL_WORKSPACE);

    // L'ordre des appels : le PATCH et la lecture d'avance sont en vol ENSEMBLE.
    const [patch] = patches();
    const [ahead] = storefrontReads();
    expect(patch).toBeDefined();
    expect(ahead === undefined ? null : headerOf(ahead)).toBe(PERSONAL_WORKSPACE);
    ahead?.flush(PERSONAL_PAGE);
    await Promise.resolve();
    expect(store.stateOf('pains')).toEqual({ status: 'ready', page: PAGE });

    patch?.flush(me(PERSONAL_WORKSPACE));
    expect(await outcome).toBe('accepted');
    expect(context.state()).toEqual({ kind: 'confirmed', workspace: PERSONAL_WORKSPACE });
    // Déjà là : aucune lecture après l'acceptation.
    expect(store.stateOf('pains')).toEqual({ status: 'ready', page: PERSONAL_PAGE });
    await store.load('pains');
    expect(storefrontReads()).toEqual([]);
  });

  it('acceptée : la photo du catalogue lue d’avance sert sans nouvel appel', async () => {
    const catalogue = TestBed.inject(ShopCatalogue);
    const hydrating = catalogue.hydrate();
    http.expectOne((r) => r.url.endsWith('/shop/catalogue/mine')).flush(EMPTY_CATALOGUE);
    await hydrating;

    const outcome = context.switchTo(PERSONAL_WORKSPACE);
    TestBed.tick();
    const [ahead] = readsFor(PERSONAL_WORKSPACE);
    expect(ahead?.request.url.endsWith('/shop/catalogue/mine')).toBe(true);
    ahead?.flush({ ...EMPTY_CATALOGUE, items: [{ sku: 'perso' }] });
    await Promise.resolve();
    expect(catalogue.items()).toEqual([]);

    patches()[0]?.flush(me(PERSONAL_WORKSPACE));
    await outcome;
    TestBed.tick();
    await Promise.resolve();
    await Promise.resolve();
    http.expectNone((r) => r.url.endsWith('/shop/catalogue/mine'));
    expect(catalogue.items()).toEqual([{ sku: 'perso' }]);
  });

  it('refusée : retour à l’ancien espace, ce qui a été lu pour l’espace refusé est jeté sans être montré', async () => {
    const store = TestBed.inject(ShopStorefront);
    const catalogue = TestBed.inject(ShopCatalogue);
    const pickups = TestBed.inject(PickupListGateway);
    await readShelfInA(store);
    const hydrating = catalogue.hydrate();
    http.expectOne((r) => r.url.endsWith('/shop/catalogue/mine')).flush(EMPTY_CATALOGUE);
    await hydrating;
    void pickups.pickupsOf('cmp_a');
    http.expectOne((r) => r.url.endsWith('/pickup-addresses/mine')).flush([]);

    const outcome = context.switchTo(PERSONAL_WORKSPACE);
    TestBed.tick();
    // Les trois lecteurs lisent d'avance, chacun avec l'en-tête de l'espace demandé.
    const ahead = readsFor(PERSONAL_WORKSPACE);
    expect(ahead.map((r) => r.request.url.replace(/^.*\/\/[^/]+/u, '')).sort()).toEqual([
      '/pickup-addresses/mine',
      '/shop/catalogue/mine',
      '/shop/storefront/pains/mine',
    ]);
    for (const read of ahead) {
      read.flush(read.request.url.endsWith('/pains/mine') ? PERSONAL_PAGE : []);
    }

    patches()[0]?.flush({ message: 'refusé' }, { status: 403, statusText: 'Forbidden' });
    expect(await outcome).toBe('refused');
    TestBed.tick();

    expect(context.state()).toEqual({ kind: 'confirmed', workspace: 'cmp_a' });
    expect(TestBed.inject(ClientWorkspace).current()).toBe('cmp_a');
    expect(store.stateOf('pains')).toEqual({ status: 'ready', page: PAGE });
    expect(catalogue.status()).toBe('ready');

    // Jeté : une bascule suivante, acceptée, relit au lieu de reprendre le refusé.
    const again = context.switchTo(PERSONAL_WORKSPACE);
    TestBed.tick();
    expect(readsFor(PERSONAL_WORKSPACE)).toHaveLength(3);
    patches()[0]?.flush(me(PERSONAL_WORKSPACE));
    await again;
  });

  it('deux bascules rapides : la dernière gagne, quel que soit l’ordre des réponses', async () => {
    const first = context.switchTo('cmp_b');
    const second = context.switchTo(PERSONAL_WORKSPACE);
    expect(context.state()).toEqual({ kind: 'switching', from: 'cmp_a', to: PERSONAL_WORKSPACE });

    const [toB, toPersonal] = patches();
    toB?.flush(me('cmp_b'));
    expect(await first).toBe('superseded');
    expect(context.prefix()).toBe('cmp_a');

    toPersonal?.flush(me(PERSONAL_WORKSPACE));
    expect(await second).toBe('accepted');
    expect(context.state()).toEqual({ kind: 'confirmed', workspace: PERSONAL_WORKSPACE });
  });

  it('la dernière refusée revient à la précédente que le serveur a acceptée', async () => {
    const first = context.switchTo('cmp_b');
    const second = context.switchTo(PERSONAL_WORKSPACE);
    const [toB, toPersonal] = patches();
    toB?.flush(me('cmp_b'));
    await first;
    toPersonal?.flush({ message: 'refusé' }, { status: 403, statusText: 'Forbidden' });
    expect(await second).toBe('refused');
    expect(context.state()).toEqual({ kind: 'confirmed', workspace: 'cmp_b' });
  });

  it('la dernière refusée, la précédente aussi : retour à l’espace d’avant le geste', async () => {
    const first = context.switchTo('cmp_b');
    const second = context.switchTo(PERSONAL_WORKSPACE);
    const [toB, toPersonal] = patches();
    toB?.flush({ message: 'refusé' }, { status: 403, statusText: 'Forbidden' });
    expect(await first).toBe('superseded');
    toPersonal?.flush({ message: 'refusé' }, { status: 403, statusText: 'Forbidden' });
    expect(await second).toBe('refused');
    expect(context.state()).toEqual({ kind: 'confirmed', workspace: 'cmp_a' });
  });
});
