import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { resolveStaffPermissions, type StaffRole } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { routes } from '../app.routes';
import type { PermissionGuard } from '../auth/permission.guard';
import { PermissionsStore } from '../auth/permissions.store';
import { PimCapabilitiesStore } from '../pim/capabilities/pim-capabilities.store';
import { WorkspaceCatalogue } from '../shared/workspace-rail/workspaces';

/**
 * **Qui prend une commande pro au comptoir** (plan-commande-au-comptoir.md) :
 * il faut lire les clients du comptoir (`b2b_counter:read`) ET commander
 * (`b2b_orders:write`). Le rail et les gardes disent la même chose.
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
      { provide: PimCapabilitiesStore, useValue: { publication: () => true } },
    ],
  });
}

function isPermissionGuard(guard: unknown): guard is PermissionGuard {
  return typeof guard === 'function' && 'permission' in guard;
}

/** Joue TOUS les gardes de la route pour ce rôle : vrai seulement si chacun laisse passer. */
async function opens(role: StaffRole, path: string): Promise<boolean> {
  configure(role);
  const comptoir = routes.find((route) => route.path === 'comptoir');
  const guards = (
    comptoir?.children?.find((child) => child.path === path)?.canActivate ?? []
  ).filter(isPermissionGuard);
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
  it.each(['nouvelle-commande', 'nouvelle-commande/:id'])(
    '« %s » s’ouvre au vendeur de comptoir, sans la fiche client',
    async (path) => {
      expect(await opens('comptoir', path)).toBe(true);
    },
  );

  it('reste fermée au support, qui lit les commandes sans pouvoir en passer', async () => {
    expect(await opens('support', 'nouvelle-commande')).toBe(false);
  });

  it('s’ouvre au commercial, qui a reçu le droit du comptoir', async () => {
    expect(await opens('commercial', 'nouvelle-commande/:id')).toBe(true);
  });

  it('a son entrée de rail pour le vendeur de comptoir, pas pour le support', () => {
    expect(counterViewKeys('comptoir')).toEqual(['retrait', 'nouvelle-commande']);
    expect(counterViewKeys('support')).toEqual(['retrait']);
  });
});
