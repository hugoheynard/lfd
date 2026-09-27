import { TestBed } from '@angular/core/testing';
import { PERSONAL_WORKSPACE } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { AuthFacade } from '../../auth/auth.facade';
import {
  CLOSED_LOYALTY,
  EMPTY_LOYALTY,
  loyaltyDouble,
  provideLoyalty,
  type LoyaltyDouble,
} from '../client-loyalty.fixture';
import { provideRecognised } from '../client-orders.fixture';
import {
  provideWorkspace,
  workspaceDouble,
  type WorkspaceDouble,
} from '../client-workspace.fixture';
import { VoucherChoice } from './voucher-choice.service';

/** Plan des points, §13, E2.2 : un bon, ou aucun — et seulement au particulier. */
describe('VoucherChoice', () => {
  let space: WorkspaceDouble;
  let loyalty: LoyaltyDouble;

  function boot(auth: unknown = null): VoucherChoice {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideWorkspace(space),
        provideLoyalty(loyalty),
        auth === null ? provideRecognised() : { provide: AuthFacade, useValue: auth },
      ],
    });
    return TestBed.inject(VoucherChoice);
  }

  beforeEach(() => {
    space = workspaceDouble();
    loyalty = loyaltyDouble();
  });

  it('ne propose que les bons disponibles — un bon réservé ne se réutilise pas', () => {
    expect(
      boot()
        .available()
        .map((v) => v.id),
    ).toEqual(['v_available']);
  });

  it('ne propose rien quand le programme est fermé', () => {
    loyalty.view.set(CLOSED_LOYALTY);
    expect(boot().available()).toEqual([]);
  });

  it('ne propose rien à un visiteur', () => {
    expect(boot({ isAuthenticated: () => false }).available()).toEqual([]);
  });

  /** « Pas de fidélité en pro » (Hugo, 2026-09-27) : la bascule éteint le bon, sans attendre. */
  it('cesse d’envoyer le bon dès la bascule vers une société, et le retrouve au retour', () => {
    const choice = boot();
    choice.select('v_available');
    expect(choice.selected()).toBe('v_available');

    space.current.set('co_1');
    expect(choice.available()).toEqual([]);
    expect(choice.selected()).toBeNull();

    space.current.set(PERSONAL_WORKSPACE);
    expect(choice.selected()).toBe('v_available');
  });

  it('n’envoie pas un bon qui n’est plus disponible à la relecture', () => {
    const choice = boot();
    choice.select('v_available');

    loyalty.view.set(EMPTY_LOYALTY);

    expect(choice.selected()).toBeNull();
  });

  it('remet le choix à « aucun » et relit la fidélité', async () => {
    const choice = boot();
    choice.select('v_available');

    await choice.release();

    expect(loyalty.reads.count).toBe(1);
    // Rendu disponible à nouveau, il n'est pas ressuscité : le choix est vide.
    expect(choice.selected()).toBeNull();
  });
});
