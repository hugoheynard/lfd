import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PERSONAL_WORKSPACE, type CompanyView } from '@lfd/contracts';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import type { Account } from '../account/account.model';
import { AccountService } from '../account/account.service';
import { AuthFacade } from '../auth/auth.facade';
import { NotifyService } from '../notify.service';
import { TOMMEUSES, PROFILE } from './mon-compte/account.fixture';
import { ClientWorkspace, companyName } from './client-workspace.service';

const MAISON_A: CompanyView = { ...TOMMEUSES, id: 'cmp_a', enseigne: 'Maison A' };
const MAISON_B: CompanyView = { ...TOMMEUSES, id: 'cmp_b', enseigne: '', raisonSociale: 'SAS B' };

function account(companies: readonly CompanyView[], workspace: string | null = null): Account {
  return {
    profile: PROFILE,
    companies,
    reachableSites: [],
    navPrefs: { catalogueView: null, workspace },
  };
}

const setWorkspace = vi.fn();

/** Un compte doublé au plus près : seuls les signaux que l'espace lit. */
function resolve(state: Account | null): ClientWorkspace {
  const held = signal(state);
  setWorkspace.mockReset();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AccountService,
        useValue: {
          account: held,
          companies: () => held()?.companies ?? [],
          setWorkspace,
        },
      },
    ],
  });
  return TestBed.inject(ClientWorkspace);
}

describe('ClientWorkspace — l’espace par défaut (plan D5, Hugo 2026-09-15)', () => {
  /** Vitruve B2 : un espace deviné avant `/me` partirait dans le mauvais panier. */
  it('ne dit rien tant que `/me` n’a pas répondu', () => {
    const workspace = resolve(null);
    expect(workspace.current()).toBeNull();
    expect(workspace.company()).toBeNull();
    expect(workspace.hasChoice()).toBe(false);
  });

  it('sans société : le perso, et aucun choix à proposer', () => {
    const workspace = resolve(account([]));
    expect(workspace.current()).toBe(PERSONAL_WORKSPACE);
    expect(workspace.hasChoice()).toBe(false);
  });

  it('une seule société et aucune préférence : cette société', () => {
    const workspace = resolve(account([MAISON_A]));
    expect(workspace.current()).toBe('cmp_a');
    expect(workspace.company()?.enseigne).toBe('Maison A');
    expect(workspace.hasChoice()).toBe(true);
  });

  /** La commerciale, 2026-10-20 : qui a un compte pro entre dans un espace pro. */
  it('plusieurs sociétés et aucune préférence : la première société active', () => {
    const pending: CompanyView = { ...MAISON_A, status: 'pending' };
    const active: CompanyView = { ...MAISON_B, status: 'active' };
    expect(resolve(account([pending, active])).current()).toBe('cmp_b');
  });

  it('plusieurs sociétés, aucune active : la première', () => {
    const a: CompanyView = { ...MAISON_A, status: 'pending' };
    const b: CompanyView = { ...MAISON_B, status: 'pending' };
    expect(resolve(account([a, b])).current()).toBe('cmp_a');
  });

  it('la préférence gagne quand elle désigne encore un rattachement', () => {
    expect(resolve(account([MAISON_A, MAISON_B], 'cmp_b')).current()).toBe('cmp_b');
  });

  it('la préférence « perso » gagne, même à une seule société', () => {
    expect(resolve(account([MAISON_A], PERSONAL_WORKSPACE)).current()).toBe(PERSONAL_WORKSPACE);
  });

  /** Une société quittée depuis : la préférence ne désigne plus rien, la règle reprend. */
  it('une préférence périmée retombe sur la règle', () => {
    expect(resolve(account([MAISON_A], 'cmp_partie')).current()).toBe('cmp_a');
  });

  it('propose le perso en tête, puis les sociétés dans l’ordre de `/me`', () => {
    const workspace = resolve(account([MAISON_A, MAISON_B]));
    expect(workspace.options().map((o) => o.value)).toEqual([PERSONAL_WORKSPACE, 'cmp_a', 'cmp_b']);
  });

  it('nomme une maison par son enseigne, sa raison sociale à défaut', () => {
    expect(companyName(MAISON_A)).toBe('Maison A');
    expect(companyName(MAISON_B)).toBe('SAS B');
  });

  it('refuse de choisir un espace qui n’est pas proposé', () => {
    const workspace = resolve(account([MAISON_A]));
    workspace.choose('cmp_inconnue');
    expect(setWorkspace).not.toHaveBeenCalled();
  });
});

/** La vraie écriture, à travers le vrai `AccountService` : optimiste, et réversible. */
describe('ClientWorkspace.choose — la préférence écrite', () => {
  function boot(): { workspace: ClientWorkspace; http: HttpTestingController; errors: unknown[] } {
    const errors: unknown[] = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthFacade,
          useValue: {
            isAuthenticated: signal(true),
            accessToken$: () => of('jeton'),
            authEmail: () => null,
          },
        },
        {
          provide: NotifyService,
          useValue: { error: (e: unknown) => errors.push(e), success: () => undefined },
        },
      ],
    });
    const workspace = TestBed.inject(ClientWorkspace);
    const http = TestBed.inject(HttpTestingController);
    TestBed.tick();
    http.expectOne((r) => r.url.endsWith('/me')).flush(account([MAISON_A, MAISON_B]));
    return { workspace, http, errors };
  }

  it('bascule tout de suite, et écrit la seule préférence d’espace', () => {
    const { workspace, http } = boot();
    // Sans préférence, plusieurs sociétés : la première active (2026-10-20).
    expect(workspace.current()).toBe('cmp_a');

    workspace.choose('cmp_b');

    expect(workspace.current()).toBe('cmp_b');
    const patch = http.expectOne((r) => r.url.endsWith('/me/nav-prefs'));
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ workspace: 'cmp_b' });
    patch.flush(account([MAISON_A, MAISON_B], 'cmp_b'));
    expect(workspace.current()).toBe('cmp_b');
  });

  it('revient en arrière et le dit quand l’écriture échoue', () => {
    const { workspace, http, errors } = boot();

    workspace.choose(PERSONAL_WORKSPACE);
    expect(workspace.current()).toBe(PERSONAL_WORKSPACE);
    http
      .expectOne((r) => r.url.endsWith('/me/nav-prefs'))
      .flush({ message: 'refus' }, { status: 409, statusText: 'Conflict' });

    expect(workspace.current()).toBe('cmp_a');
    expect(errors).toHaveLength(1);
  });

  /** Deux bascules rapprochées : la réponse de la première ne rebascule pas l'écran. */
  it('une réponse tardive d’une bascule antérieure ne défait pas la suivante', () => {
    const { workspace, http } = boot();

    workspace.choose('cmp_a');
    workspace.choose('cmp_b');
    const [first, second] = http.match((r) => r.url.endsWith('/me/nav-prefs'));
    first?.flush(account([MAISON_A, MAISON_B], 'cmp_a'));

    expect(workspace.current()).toBe('cmp_b');
    second?.flush(account([MAISON_A, MAISON_B], 'cmp_b'));
    expect(workspace.current()).toBe('cmp_b');
  });
});

describe('ClientWorkspace — les sites atteints par héritage (S6, R4 R5)', () => {
  const SITE: CompanyView = {
    ...TOMMEUSES,
    id: 'cmp_site',
    enseigne: 'Site Daille',
    role: 'admin',
  };
  const reachable = (canReadBilling: boolean) => ({
    company: SITE,
    via: { companyId: 'cmp_a', name: 'Maison A' },
    canReadBilling,
  });
  const withSite = (workspace: string | null, canReadBilling = true): Account => ({
    ...account([MAISON_A], workspace),
    reachableSites: [reachable(canReadBilling)],
  });

  it('liste le perso, les sociétés propres, PUIS les sites, chacun « via » son principal', () => {
    const workspace = resolve(withSite(null));
    expect(workspace.options().map((o) => [o.value, o.via])).toEqual([
      [PERSONAL_WORKSPACE, null],
      ['cmp_a', null],
      ['cmp_site', 'Maison A'],
    ]);
  });

  /** R4 : un site ne sert jamais d'office, il se choisit. */
  it('sans préférence, un site n’est jamais l’espace par défaut', () => {
    const workspace = resolve({ ...withSite(null), companies: [] });
    expect(workspace.current()).toBe(PERSONAL_WORKSPACE);
    expect(workspace.hasChoice()).toBe(true);
  });

  it('un site choisi est l’espace, et sa fiche est la société de l’espace', () => {
    const workspace = resolve(withSite('cmp_site'));
    expect(workspace.current()).toBe('cmp_site');
    expect(workspace.company()).toBe(SITE);
    expect(workspace.siteBillingReadable()).toBe(true);
  });

  it('se laisse choisir comme une société propre', () => {
    resolve(withSite(null)).choose('cmp_site');
    expect(setWorkspace).toHaveBeenCalledWith('cmp_site');
  });

  /** Q1 : un admin hérité ne lit pas la facturation du site, quel que soit son rôle. */
  it('la lecture de la facturation suit `canReadBilling`, pas le rôle', () => {
    expect(resolve(withSite('cmp_site', false)).siteBillingReadable()).toBe(false);
  });

  it('dans une société propre, la facturation n’est pas l’affaire du site', () => {
    expect(resolve(withSite('cmp_a')).siteBillingReadable()).toBeNull();
  });

  it('un site détaché disparaît, et l’espace retombe sur la société propre', () => {
    const workspace = resolve({ ...withSite('cmp_site'), reachableSites: [] });
    expect(workspace.current()).toBe('cmp_a');
    expect(workspace.options().some((o) => o.value === 'cmp_site')).toBe(false);
  });
});
