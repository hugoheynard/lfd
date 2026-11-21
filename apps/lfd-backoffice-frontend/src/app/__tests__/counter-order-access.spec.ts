import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { resolveStaffPermissions, type StaffRole } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { routes } from '../app.routes';
import type { PermissionGuard } from '../auth/permission.guard';
import { PermissionsStore } from '../auth/permissions.store';
import { WorkspaceCatalogue } from '../shared/workspace-rail/workspaces';

/**
 * **Qui prend une commande pro au comptoir** (architecture-commande-au-comptoir.md) :
 * il faut lire les clients du comptoir (`b2b_counter:read`) ET commander
 * (`b2b_place_order:write`, sorti de `b2b_orders` le 2026-10-01). Le rail et
 * les gardes disent la même chose.
 *
 * Les droits viennent de `resolveStaffPermissions`, pas d'une liste recopiée :
 * le jour où un rôle gagne ou perd l'un des deux, ces cas le disent.
 */

function configure(role: StaffRole): void {
  const permissions = resolveStaffPermissions(role);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: PermissionsStore,
        useValue: {
          ensureLoaded: (): Promise<void> => Promise.resolve(),
          can: (permission) => permissions.includes(permission),
        } satisfies Pick<PermissionsStore, 'ensureLoaded' | 'can'>,
      },
    ],
  });
}

function isPermissionGuard(guard: unknown): guard is PermissionGuard {
  return typeof guard === 'function' && 'permission' in guard;
}

/** Joue TOUS les gardes de la route pour ce rôle : vrai seulement si chacun laisse passer. */
async function opens(role: StaffRole, path: string): Promise<boolean> {
  configure(role);
  // La saisie est une page à part (`/nouvelle-commande`, Hugo, 2026-11-21).
  const page = routes.find((route) => route.path === 'nouvelle-commande');
  const guards = (page?.children?.find((child) => child.path === path)?.canActivate ?? []).filter(
    isPermissionGuard,
  );
  expect(guards.length).toBe(2);
  const state = TestBed.inject(Router).routerState.snapshot;
  const injector = TestBed.inject(Injector);
  for (const guard of guards) {
    const result = await runInInjectionContext(injector, () => guard(state.root, state));
    if (result !== true) {
      return false;
    }
  }
  return true;
}

function counterViewKeys(role: StaffRole): string[] {
  configure(role);
  return TestBed.inject(WorkspaceCatalogue)
    .views('comptoir')()
    .map((view) => view.key);
}

describe('la commande pro au comptoir', () => {
  it.each(['', 'pro', 'particulier', ':id'])(
    '« %s » s’ouvre au vendeur de comptoir, sans la fiche client',
    async (path) => {
      expect(await opens('comptoir', path)).toBe(true);
    },
  );

  it('reste fermée au support, qui lit les commandes sans pouvoir en passer', async () => {
    expect(await opens('support', '')).toBe(false);
  });

  it('s’ouvre au commercial, qui a reçu le droit du comptoir', async () => {
    expect(await opens('commercial', ':id')).toBe(true);
  });

  it('n’est plus un onglet du comptoir : un bouton de sa bande l’ouvre', () => {
    // Le retrait en tête ; le réassort suit le droit du retrait.
    expect(counterViewKeys('comptoir')).toEqual(['retrait', 'reassort']);
    expect(counterViewKeys('support')).toEqual(['retrait', 'reassort']);
  });
});
