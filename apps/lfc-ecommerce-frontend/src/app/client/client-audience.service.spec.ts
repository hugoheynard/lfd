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

  /** Déclarer une société ne demande aucune vérification (vitruve, B1). */
  it('une société en attente de validation est B2C', () => {
    expect(resolve(true, 'cmp_1', [company('pending')]).current()).toBe('b2c');
  });

  it('une société suspendue est B2C', () => {
    expect(resolve(true, 'cmp_1', [company('suspended')]).current()).toBe('b2c');
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
 * L'annonce d'une remise de retrait suit ce que la caisse appliquera, pas la
 * clientèle : une société en attente est servie en pro.
 */
describe('ClientAudience — quelle remise de retrait annoncer', () => {
  it('un visiteur lit l’annonce des particuliers', () => {
    expect(resolve(false, null).announcement()).toBe('b2c');
  });

  it('une société active lit l’annonce des pros', () => {
    expect(resolve(true, 'cmp_1', [company('active')]).announcement()).toBe('b2b');
  });

  /**
   * Régression : une société en attente lisait l’annonce des particuliers et
   * se voyait promettre leur promotion, que la caisse — qui la sert en pro —
   * ne retirait pas (2026-10-31).
   */
  it('une société en attente lit SA propre annonce, pas celle des particuliers', () => {
    const audience = resolve(true, 'cmp_1', [company('pending')]);
    expect(audience.announcement()).toBe('b2bPending');
    expect(audience.current()).toBe('b2c');
  });

  it('une société suspendue lit l’annonce des particuliers', () => {
    expect(resolve(true, 'cmp_1', [company('suspended')]).announcement()).toBe('b2c');
  });

  it('reconnu avant `/me` : l’annonce des particuliers, par prudence', () => {
    expect(resolve(true, null).announcement()).toBe('b2c');
  });
});
