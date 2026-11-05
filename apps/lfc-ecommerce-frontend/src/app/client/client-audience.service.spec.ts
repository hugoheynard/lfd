import { TestBed } from '@angular/core/testing';
import { type CompanyStatus, type CompanyView, PERSONAL_WORKSPACE } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { AuthFacade } from '../auth/auth.facade';
import { ClientAudience } from './client-audience.service';
import { provideWorkspace, workspaceDouble } from './client-workspace.fixture';
import { TOMMEUSES } from './mon-compte/account.fixture';

const company = (status: CompanyStatus): CompanyView => ({ ...TOMMEUSES, id: 'cmp_1', status });

function resolve(
  recognised: boolean,
  current: string | null,
  companies: readonly CompanyView[] = [],
) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideWorkspace(workspaceDouble(current, companies)),
      { provide: AuthFacade, useValue: { isAuthenticated: () => recognised } },
    ],
  });
  return TestBed.inject(ClientAudience);
}

/** Plan remise et livraison par clientèle, D1 — et Q3 : société ACTIVE seulement. */
describe('ClientAudience — la clientèle de l’écran', () => {
  it('un visiteur est B2C', () => {
    const audience = resolve(false, null);
    expect(audience.current()).toBe('b2c');
    expect(audience.shown()).toBe('b2c');
  });

  it('l’espace perso est B2C, même pour qui a une société active', () => {
    const audience = resolve(true, PERSONAL_WORKSPACE, [company('active')]);
    expect(audience.current()).toBe('b2c');
  });

  /** Une société en attente est pro, sauf le crédit (Hugo, 2026-11-05). */
  it('une société en attente de validation est B2B', () => {
    expect(resolve(true, 'cmp_1', [company('pending')]).current()).toBe('b2b');
  });

  it('une société close est B2C', () => {
    expect(resolve(true, 'cmp_1', [company('terminated')]).current()).toBe('b2c');
  });

  // Une suspendue est servie comme une active, sauf le crédit (Hugo, 2026-11-03).
  it('une société suspendue est B2B', () => {
    expect(resolve(true, 'cmp_1', [company('suspended')]).current()).toBe('b2b');
  });

  it('une société active est B2B', () => {
    const audience = resolve(true, 'cmp_1', [company('active')]);
    expect(audience.current()).toBe('b2b');
    expect(audience.shown()).toBe('b2b');
  });

  /**
   * Reconnu, `/me` pas encore là : la clientèle est INCONNUE, et c'est ce qui
   * empêche d'effacer une livraison légitime sur une supposition. L'écran, lui,
   * montre B2C en attendant — n'annoncer aucune remise pro ne promet rien.
   */
  it('reconnu avant `/me` : inconnue, montrée B2C', () => {
    const audience = resolve(true, null);
    expect(audience.current()).toBeNull();
    expect(audience.shown()).toBe('b2c');
  });
});

/**
 * Le serveur choisit désormais la remise de chaque point (2026-10-31) : il ne
 * reste à la boutique qu'à savoir si la caisse la sert en pro — « Prix pro »
 * ou « Prix boutique » sur un point sans remise.
 */
describe('ClientAudience — servi en pro par la caisse', () => {
  it('un visiteur ne l’est pas', () => {
    expect(resolve(false, null).servedAsPro()).toBe(false);
  });

  it('une société active l’est', () => {
    expect(resolve(true, 'cmp_1', [company('active')]).servedAsPro()).toBe(true);
  });

  /**
   * Régression : une société en attente lisait l’étiquette des particuliers,
   * alors que la caisse la sert en pro (2026-10-31).
   */
  it('une société en attente l’est, et de la clientèle B2B depuis le 2026-11-05', () => {
    const audience = resolve(true, 'cmp_1', [company('pending')]);
    expect(audience.servedAsPro()).toBe(true);
    expect(audience.current()).toBe('b2b');
  });

  it('une société suspendue l’est aussi (2026-11-03)', () => {
    expect(resolve(true, 'cmp_1', [company('suspended')]).servedAsPro()).toBe(true);
  });

  it('reconnu avant `/me` : pas encore, par prudence', () => {
    expect(resolve(true, null).servedAsPro()).toBe(false);
  });
});

/**
 * Lot d (2026-11-05) : la clientèle suivait l'espace COURANT, qui vaut la cible
 * dès le départ d'une bascule ; elle suit désormais l'espace AFFICHÉ.
 */
describe('ClientAudience — pendant une bascule', () => {
  it('reste celle de l’espace montré, puis passe à la cible quand elle est acceptée', () => {
    const space = workspaceDouble('cmp_1', [company('active')]);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideWorkspace(space),
        { provide: AuthFacade, useValue: { isAuthenticated: () => true } },
      ],
    });
    const audience = TestBed.inject(ClientAudience);
    expect(audience.current()).toBe('b2b');

    space.current.set(PERSONAL_WORKSPACE);
    space.switching.set({ from: 'cmp_1', to: PERSONAL_WORKSPACE });
    expect(audience.current()).toBe('b2b');
    expect(audience.servedAsPro()).toBe(true);

    space.switching.set(null);
    expect(audience.current()).toBe('b2c');
    expect(audience.servedAsPro()).toBe(false);
  });
});
