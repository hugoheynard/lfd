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
 * **Qui entre dans l'espace Livraison, et par quelle porte**
 * (plan-preparation-de-tournee.md, lot 2, Q7/Q8) : la feuille de route sous
 * `delivery_run_sheet`, la flotte et le départ sous `delivery_settings`, et
 * depuis le lot 3 les tournées sous `delivery_rounds` (Q12). Le rail et les
 * gardes doivent dire la même chose, rôle par rôle.
 *
 * Les droits viennent de `resolveStaffPermissions`, pas d'une liste recopiée.
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

/** Joue les gardes de la coquille PUIS de la vue : vrai si tous laissent passer. */
async function opens(role: StaffRole, path: string): Promise<boolean> {
  configure(role);
  const shell = routes.find((route) => route.path === 'livraison');
  const view = shell?.children?.find((child) => child.path === path);
  expect(view).toBeDefined();
  const guards = [...(shell?.canActivate ?? []), ...(view?.canActivate ?? [])].filter(
    isPermissionGuard,
  );
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

function deliveryViewKeys(role: StaffRole): string[] {
  configure(role);
  return TestBed.inject(WorkspaceCatalogue)
    .views('livraison')()
    .map((view) => view.key);
}

describe("l'espace Livraison", () => {
  it('ouvre les neuf vues au comptoir, qui prépare les départs, compose, simule, compare des bacs et charge (Q12, Q21, lot 9, G3)', async () => {
    expect(deliveryViewKeys('comptoir')).toEqual([
      'feuille-de-route',
      'tournees',
      'simulateur',
      'assistant-achat',
      'chargement',
      'vehicules',
      'bacs',
      'contenances',
      'depart',
    ]);
    expect(await opens('comptoir', 'tournees')).toBe(true);
    expect(await opens('comptoir', 'simulateur')).toBe(true);
    expect(await opens('comptoir', 'assistant-achat')).toBe(true);
    expect(await opens('comptoir', 'chargement')).toBe(true);
    expect(await opens('comptoir', 'chargement/:roundId')).toBe(true);
    expect(await opens('comptoir', 'bac/:binId')).toBe(true);
    expect(await opens('comptoir', 'etiquettes/:orderId')).toBe(true);
    expect(await opens('comptoir', 'vehicules')).toBe(true);
    expect(await opens('comptoir', 'bacs')).toBe(true);
    expect(await opens('comptoir', 'contenances')).toBe(true);
    expect(await opens('comptoir', 'depart')).toBe(true);
  });

  it('garde au support la seule feuille de route (Q8)', async () => {
    expect(deliveryViewKeys('support')).toEqual(['feuille-de-route']);
    expect(await opens('support', 'feuille-de-route')).toBe(true);
    expect(await opens('support', 'vehicules')).toBe(false);
    expect(await opens('support', 'tournees')).toBe(false);
    expect(await opens('support', 'chargement')).toBe(false);
    expect(await opens('support', 'bac/:binId')).toBe(false);
  });

  it('ne montre ni n’ouvre le chargement au commercial (Q21 : admin et comptoir)', async () => {
    expect(deliveryViewKeys('commercial')).not.toContain('chargement');
    expect(await opens('commercial', 'chargement')).toBe(false);
    expect(await opens('commercial', 'etiquettes/:orderId')).toBe(false);
  });

  it('ne montre ni n’ouvre les tournées au commercial', async () => {
    expect(deliveryViewKeys('commercial')).not.toContain('tournees');
    expect(await opens('commercial', 'tournees')).toBe(false);
  });

  it('🔴 la coquille ne ferme aucune vue : ni la flotte à qui ne lit qu’elle, ni l’inverse', () => {
    const shell = routes.find((route) => route.path === 'livraison');
    expect((shell?.canActivate ?? []).filter(isPermissionGuard)).toEqual([]);
  });

  it('renvoie l’ancienne adresse `/livraison` vers la feuille de route', () => {
    const shell = routes.find((route) => route.path === 'livraison');
    expect(shell?.children?.find((child) => child.path === '')?.redirectTo).toBe(
      'feuille-de-route',
    );
  });
});
