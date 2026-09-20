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
  return { profile: PROFILE, companies, navPrefs: { catalogueView: null, workspace } };
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

  /** Q2 : ce que le serveur sert déjà sans en-tête — aucun changement de prix. */
  it('plusieurs sociétés et aucune préférence : le perso, pas la première', () => {
    const workspace = resolve(account([MAISON_A, MAISON_B]));
    expect(workspace.current()).toBe(PERSONAL_WORKSPACE);
    expect(workspace.company()).toBeNull();
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
    expect(workspace.current()).toBe(PERSONAL_WORKSPACE);

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

    workspace.choose('cmp_a');
    http
      .expectOne((r) => r.url.endsWith('/me/nav-prefs'))
      .flush({ message: 'refus' }, { status: 409, statusText: 'Conflict' });

    expect(workspace.current()).toBe(PERSONAL_WORKSPACE);
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
