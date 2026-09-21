import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, type Route } from '@angular/router';
import { resolveStaffPermissions, type StaffRole } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import type { PermissionGuard } from '../auth/permission.guard';
import { PermissionsStore } from '../auth/permissions.store';
import { pimRoutes } from '../pim/pim.routes';
import { PimCapabilitiesStore } from '../pim/capabilities/pim-capabilities.store';
import { WorkspaceCatalogue } from '../shared/workspace-rail/workspaces';

/**
 * **Qui voit le journal fiscal** (plan journalisation, lot 4) : le serveur
 * sert la tranche sous `pim_tax:write` — `admin` et `comptabilite`. Le
 * commercial a `pim_tax:read` : il voit les taux, et ne doit voir ni l'entrée
 * ni l'écran, dont chaque appel lui rendrait 403.
 *
 * Les droits viennent de `resolveStaffPermissions`, pas d'une liste recopiée :
 * le jour où un rôle gagne ou perd `pim_tax:write`, ces cas le disent.
 */

function storeFor(role: StaffRole): Pick<PermissionsStore, 'ensureLoaded' | 'can'> {
  const permissions = resolveStaffPermissions(role);
  return {
    ensureLoaded: (): Promise<void> => Promise.resolve(),
    can: (permission) => permissions.includes(permission),
  };
}

function configure(role: StaffRole): void {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: PermissionsStore, useValue: storeFor(role) },
      { provide: PimCapabilitiesStore, useValue: { publication: () => true } },
    ],
  });
}

function taxJournalRoute(): Route | undefined {
  return pimRoutes[0]?.children?.find((route) => route.path === 'journal-fiscal');
}

/** Même prédicat que `app.routes.spec.ts` : `canActivate` admet aussi des classes. */
function isPermissionGuard(guard: unknown): guard is PermissionGuard {
  return typeof guard === 'function' && 'permission' in guard;
}

/** Le garde de la route du journal fiscal, joué pour ce rôle. */
async function guardFor(role: StaffRole): Promise<boolean | UrlTree> {
  configure(role);
  const guard = taxJournalRoute()?.canActivate?.[0];
  if (!isPermissionGuard(guard)) {
    throw new Error('la route du journal fiscal ne porte pas de garde fonctionnel');
  }
  const injector = TestBed.inject(Injector);
  return runInInjectionContext(injector, () =>
    Promise.resolve(guard(null as never, null as never)),
  ) as Promise<boolean | UrlTree>;
}

function pimViewKeys(role: StaffRole): string[] {
  configure(role);
  return TestBed.inject(WorkspaceCatalogue)
    .views('pim')()
    .map((view) => view.key);
}

describe('la route du journal fiscal', () => {
  it('lit la tranche fiscale', () => {
    expect(taxJournalRoute()?.data).toEqual({ journalSource: 'tax' });
  });

  it('refuse le commercial, qui n’a que pim_tax:read, en le renvoyant ailleurs', async () => {
    const result = await guardFor('commercial');

    expect(result).toBeInstanceOf(UrlTree);
    const redirect = result instanceof UrlTree ? TestBed.inject(Router).serializeUrl(result) : null;
    expect(redirect).toBe('/commercial/comptes-clients');
  });

  it('laisse passer la comptabilité et l’administrateur', async () => {
    expect(await guardFor('comptabilite')).toBe(true);
    expect(await guardFor('admin')).toBe(true);
  });
});

describe('l’entrée « Journal fiscal » du référentiel', () => {
  it('n’apparaît pas pour le commercial, qui voit pourtant les taux', () => {
    const keys = pimViewKeys('commercial');

    expect(keys).toContain('vat');
    expect(keys).not.toContain('tax-journal');
  });

  it('apparaît pour la comptabilité, juste après les règles comptables', () => {
    const keys = pimViewKeys('comptabilite');

    expect(keys.indexOf('tax-journal')).toBe(keys.indexOf('accounting') + 1);
  });
});
