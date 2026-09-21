import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  PERSONAL_WORKSPACE,
  WORKSPACE_HEADER,
  type ShopCartPayload,
  type ShopCartResponse,
  type ShopCartView,
} from '@lfd/contracts';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthFacade } from '../../auth/auth.facade';
import {
  provideWorkspace,
  workspaceDouble,
  type WorkspaceDouble,
} from '../client-workspace.fixture';
import { CartStore } from './cart.store';
import { ShopCartSync } from './shop-cart-sync.service';

/** La route, quelle que soit la racine d'API configurée. */
const CART = (request: { url: string }): boolean => request.url.endsWith('/shop/cart');

/** L'accalmie avant écriture ; avant, rien n'a bougé sur le réseau. */
const QUIET_MS = 400;

const HIER = '2026-09-05T08:00:00.000Z';
const AUJOURD_HUI = '2026-09-06T08:00:00.000Z';

const MAISON_A = 'cmp_a';
const MAISON_B = 'cmp_b';

interface Rig {
  cart: CartStore;
  http: HttpTestingController;
  workspace: WorkspaceDouble;
  recognised: WritableSignal<boolean>;
}

/**
 * L'app est **zoneless** : `fakeAsync` n'y existe pas. On avance les horloges de
 * vitest, et on pousse les effets à la main — `toObservable` émet depuis un
 * effet, qui ne s'exécute pas tout seul en test.
 */
function quiet(ms = QUIET_MS): void {
  TestBed.tick();
  vi.advanceTimersByTime(ms);
  TestBed.tick();
}

/**
 * Auth0 est doublée — tenant distant — et l'espace aussi : sa résolution a sa
 * propre suite, et ici on veut BASCULER à la main, au milieu d'une accalmie.
 */
function boot(current: string | null = MAISON_A, recognised = true): Rig {
  const workspace = workspaceDouble(current);
  const recognised$ = signal(recognised);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideWorkspace(workspace),
      {
        provide: AuthFacade,
        useValue: { isAuthenticated: recognised$, accessToken$: () => of('jeton-de-test') },
      },
    ],
  });
  return {
    cart: TestBed.inject(CartStore),
    http: TestBed.inject(HttpTestingController),
    workspace,
    recognised: recognised$,
  };
}

/** Réveille la synchronisation. */
function wake(): void {
  TestBed.inject(ShopCartSync);
  TestBed.tick();
}

/** La lecture en attente, pour l'espace attendu. */
function reading(http: HttpTestingController, workspace: string): TestRequest {
  const request = http.expectOne((r) => CART(r) && r.method === 'GET');
  expect(request.request.headers.get(WORKSPACE_HEADER)).toBe(workspace);
  return request;
}

/** Répond à la lecture de cet espace par ce que le serveur porte. */
function serverHolds(
  http: HttpTestingController,
  workspace: string,
  cart: ShopCartView | null,
): void {
  reading(http, workspace).flush({ cart } satisfies ShopCartResponse);
  TestBed.tick();
}

function writes(http: HttpTestingController): TestRequest[] {
  return http.match((r) => CART(r) && r.method === 'PUT');
}

function saved(lines: ShopCartView['lines'], savedAt: string): ShopCartView {
  return { lines, savedAt };
}

const linesOf = (request: TestRequest): ShopCartPayload['lines'] =>
  (request.request.body as ShopCartPayload).lines;

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ShopCartSync — la fusion', () => {
  /** Le sens qui justifie le chantier : le panier du matin retrouvé l'après-midi. */
  it('reprend le panier du serveur quand il est plus récent que celui du navigateur', () => {
    const { cart, http } = boot();
    cart.setQuantity('VIE-001', 1, HIER);
    wake();

    serverHolds(http, MAISON_A, saved([{ sku: 'PAT-001', quantity: 4 }], AUJOURD_HUI));

    expect(cart.quantities()).toEqual({ 'PAT-001': 4 });
    quiet();
    expect(writes(http)).toEqual([]);
  });

  /** Une union ligne à ligne aurait ressuscité le panier de la veille. */
  it('un panier vidé sur un autre appareil vide celui-ci', () => {
    const { cart, http } = boot();
    cart.setQuantity('VIE-001', 3, HIER);
    wake();

    serverHolds(http, MAISON_A, saved([], AUJOURD_HUI));

    expect(cart.quantities()).toEqual({});
  });

  it('pousse la copie du navigateur quand c’est elle la plus récente', () => {
    const { cart, http } = boot();
    cart.setQuantity('VIE-001', 2, AUJOURD_HUI);
    wake();

    serverHolds(http, MAISON_A, saved([{ sku: 'PAT-001', quantity: 9 }], HIER));

    const [written] = writes(http);
    expect(written && linesOf(written)).toEqual([{ sku: 'VIE-001', quantity: 2 }]);
    expect(written?.request.headers.get(WORKSPACE_HEADER)).toBe(MAISON_A);
  });

  it('un panier local sans date cède devant une copie du serveur', () => {
    localStorage.setItem('lfc.cart', JSON.stringify({ 'VIE-001': 1 }));
    const { cart, http } = boot();
    expect(cart.savedAt()).toBeNull();
    wake();

    serverHolds(http, MAISON_A, saved([{ sku: 'PAT-001', quantity: 2 }], HIER));

    expect(cart.quantities()).toEqual({ 'PAT-001': 2 });
  });

  it('n’écrit rien quand personne n’a jamais rien composé', () => {
    const { http } = boot();
    wake();

    serverHolds(http, MAISON_A, null);

    quiet();
    expect(writes(http)).toEqual([]);
  });

  it('une salve de gestes ne fait qu’un seul enregistrement', () => {
    const { cart, http } = boot();
    wake();
    serverHolds(http, MAISON_A, null);

    cart.setQuantity('VIE-001', 1);
    cart.setQuantity('VIE-001', 2);
    cart.setQuantity('VIE-001', 3);
    quiet();

    const all = writes(http);
    expect(all).toHaveLength(1);
    expect(all[0] && linesOf(all[0])).toEqual([{ sku: 'VIE-001', quantity: 3 }]);
  });

  it('un échec de lecture ne touche pas au panier affiché', () => {
    const { cart, http } = boot();
    cart.setQuantity('VIE-001', 2, HIER);
    wake();

    reading(http, MAISON_A).error(new ProgressEvent('coupure'));
    TestBed.tick();

    expect(cart.quantities()).toEqual({ 'VIE-001': 2 });
  });

  /** Régression : un geste fait pendant une lecture lente partait avant elle. */
  it('n’écrit rien tant que la lecture n’a pas répondu', () => {
    const { cart, http } = boot();
    wake();
    const pending = reading(http, MAISON_A);

    cart.setQuantity('VIE-001', 1);
    quiet();
    expect(writes(http)).toEqual([]);

    pending.flush({ cart: saved([{ sku: 'PAT-001', quantity: 2 }], HIER) });
    TestBed.tick();

    expect(cart.quantities()).toEqual({ 'VIE-001': 1 });
    const all = writes(http);
    expect(all).toHaveLength(1);
    expect(all[0] && linesOf(all[0])).toEqual([{ sku: 'VIE-001', quantity: 1 }]);
  });

  it('reprend l’écriture après un échec', () => {
    const { cart, http } = boot();
    wake();
    serverHolds(http, MAISON_A, null);

    cart.setQuantity('VIE-001', 1);
    quiet();
    writes(http)[0]?.error(new ProgressEvent('coupure'));
    TestBed.tick();

    cart.setQuantity('VIE-001', 2);
    quiet();
    const all = writes(http);
    expect(all).toHaveLength(1);
    expect(all[0] && linesOf(all[0])).toEqual([{ sku: 'VIE-001', quantity: 2 }]);
  });
});

/** Vitruve B2 et plan D9 : un panier par espace, et rien ne passe de l'un à l'autre. */
describe('ShopCartSync — un panier par espace', () => {
  /** Avant `/me`, lire le panier sans en-tête serait lire celui d'un autre espace. */
  it('attend l’espace connu avant de relire', () => {
    const { http, workspace } = boot(null);
    wake();
    http.expectNone(CART);

    workspace.current.set(MAISON_A);
    TestBed.tick();

    reading(http, MAISON_A);
  });

  /**
   * 🔴 L'état composé dans A, en attente d'accalmie au moment de la bascule,
   * serait parti trois cents millisecondes plus tard — dans B.
   */
  it('une bascule pendant l’accalmie abandonne l’écriture en attente', () => {
    const { cart, http, workspace } = boot();
    wake();
    serverHolds(http, MAISON_A, null);

    cart.setQuantity('VIE-001', 4);
    TestBed.tick();
    vi.advanceTimersByTime(100);
    workspace.current.set(MAISON_B);
    TestBed.tick();
    serverHolds(http, MAISON_B, null);
    quiet();

    expect(writes(http)).toEqual([]);
    expect(cart.scope()).toBe(MAISON_B);
    expect(cart.quantities()).toEqual({});
  });

  /** Abandonnée ne veut pas dire perdue : la copie locale de A garde le geste. */
  it('l’espace quitté retrouve son panier au retour', () => {
    const { cart, http, workspace } = boot();
    wake();
    serverHolds(http, MAISON_A, null);
    cart.setQuantity('VIE-001', 4);

    workspace.current.set(MAISON_B);
    TestBed.tick();
    serverHolds(http, MAISON_B, null);
    workspace.current.set(MAISON_A);
    TestBed.tick();
    serverHolds(http, MAISON_A, null);

    expect(cart.quantities()).toEqual({ 'VIE-001': 4 });
  });

  /**
   * 🔴 L'ancienne synchronisation poussait la copie locale sur toute lecture
   * vide. Après une bascule, cette copie était encore celle de l'espace quitté.
   */
  it('une relecture vide après bascule ne pousse rien', () => {
    localStorage.setItem(`lfc.cart.ws.${MAISON_B}`, JSON.stringify({ 'PAI-001': 2 }));
    const { cart, http, workspace } = boot();
    wake();
    serverHolds(http, MAISON_A, saved([{ sku: 'VIE-001', quantity: 5 }], HIER));

    workspace.current.set(MAISON_B);
    TestBed.tick();
    // Le magasin a changé d'espace AVANT la réponse : c'est la copie de B à l'écran.
    expect(cart.quantities()).toEqual({ 'PAI-001': 2 });
    serverHolds(http, MAISON_B, null);
    quiet();

    expect(writes(http)).toEqual([]);
    expect(cart.quantities()).toEqual({ 'PAI-001': 2 });
  });

  /** Une lecture de A revenue après la bascule vers B ne s'installe pas dans B. */
  it('une lecture revenue après la bascule est ignorée', () => {
    const { cart, http, workspace } = boot();
    wake();
    const late = reading(http, MAISON_A);

    workspace.current.set(MAISON_B);
    TestBed.tick();
    expect(late.cancelled).toBe(true);
    serverHolds(http, MAISON_B, saved([{ sku: 'PAT-001', quantity: 1 }], HIER));

    expect(cart.quantities()).toEqual({ 'PAT-001': 1 });
  });

  /** L'écriture partie avant la bascule garde l'espace de son geste. */
  it('l’écriture porte l’espace capturé au geste', () => {
    const { cart, http, workspace } = boot();
    wake();
    serverHolds(http, MAISON_A, null);
    cart.setQuantity('VIE-001', 1);
    quiet();

    workspace.current.set(MAISON_B);
    TestBed.tick();

    const [written] = writes(http);
    expect(written?.request.headers.get(WORKSPACE_HEADER)).toBe(MAISON_A);
  });

  it('entre et sort du perso comme d’une société', () => {
    const { cart, http, workspace } = boot(PERSONAL_WORKSPACE);
    wake();
    serverHolds(http, PERSONAL_WORKSPACE, saved([{ sku: 'CHO-001', quantity: 1 }], HIER));

    workspace.current.set(MAISON_A);
    TestBed.tick();
    serverHolds(http, MAISON_A, null);

    expect(cart.quantities()).toEqual({});
  });
});

describe('ShopCartSync — le visiteur qui se reconnaît', () => {
  it('son panier remonte dans l’espace où il entre, et ne reste pas sous la clé visiteur', () => {
    const { cart, http, workspace, recognised } = boot(null, false);
    wake();
    cart.setQuantity('VIE-001', 2);
    http.expectNone(CART);

    recognised.set(true);
    workspace.current.set(MAISON_A);
    TestBed.tick();
    // La première résolution n'efface rien : le panier est toujours à l'écran.
    expect(cart.quantities()).toEqual({ 'VIE-001': 2 });
    serverHolds(http, MAISON_A, null);

    const [written] = writes(http);
    expect(written && linesOf(written)).toEqual([{ sku: 'VIE-001', quantity: 2 }]);
    expect(written?.request.headers.get(WORKSPACE_HEADER)).toBe(MAISON_A);
    expect(localStorage.getItem('lfc.cart')).toBeNull();
  });

  /** Une seule fois : l'espace suivant ne reçoit pas le panier du visiteur. */
  it('ne remonte pas une seconde fois à la bascule suivante', () => {
    const { cart, http, workspace, recognised } = boot(null, false);
    wake();
    cart.setQuantity('VIE-001', 2);
    recognised.set(true);
    workspace.current.set(MAISON_A);
    TestBed.tick();
    serverHolds(http, MAISON_A, null);
    writes(http)[0]?.flush(saved([{ sku: 'VIE-001', quantity: 2 }], AUJOURD_HUI));

    workspace.current.set(PERSONAL_WORKSPACE);
    TestBed.tick();
    serverHolds(http, PERSONAL_WORKSPACE, null);
    quiet();

    expect(writes(http)).toEqual([]);
    expect(cart.quantities()).toEqual({});
  });
});
