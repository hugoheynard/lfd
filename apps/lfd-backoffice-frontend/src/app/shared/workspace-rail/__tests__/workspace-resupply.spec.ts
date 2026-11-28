import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { CustomerRequestsInbox } from '../../../b2b/demandes/customer-requests-inbox.store';
import { prodManagerLanding } from '../../../production/prod-manager/prod-manager-views';
import { ResupplySwitchStore } from '../../resupply-switch/resupply-switch.store';
import { WorkspaceCatalogue } from '../workspaces';

const enabled = signal(false);
let granted: (permission: string) => boolean = () => true;

function boot(): void {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: PermissionsStore,
        useValue: {
          ensureLoaded: () => Promise.resolve(),
          can: (permission) => granted(permission),
        } satisfies Pick<PermissionsStore, 'ensureLoaded' | 'can'>,
      },
      { provide: CustomerRequestsInbox, useValue: { pendingCount: () => null } },
      {
        provide: ResupplySwitchStore,
        useValue: {
          ensureLoaded: () => Promise.resolve(),
          enabled,
        } satisfies Pick<ResupplySwitchStore, 'ensureLoaded' | 'enabled'>,
      },
    ],
  });
}

/** L'interrupteur du réassort (plan-interrupteur-du-reassort.md) masque l'onglet du comptoir. */
describe('le réassort du comptoir suit l’interrupteur', () => {
  it('éteint, l’onglet Réassort disparaît ; allumé, il revient', () => {
    enabled.set(false);
    boot();
    const views = TestBed.inject(WorkspaceCatalogue).views('comptoir');
    expect(views().map((view) => view.key)).toEqual(['retrait']);

    enabled.set(true);
    expect(views().map((view) => view.key)).toEqual(['retrait', 'reassort']);
  });

  it('ne publie pas le marqueur de l’interrupteur dans les entrées', () => {
    enabled.set(true);
    boot();
    const reassort = TestBed.inject(WorkspaceCatalogue)
      .views('comptoir')()
      .find((view) => view.key === 'reassort');
    expect(reassort).toBeDefined();
    expect(Object.keys(reassort ?? {})).not.toContain('requiresResupply');
  });

  it('l’atterrissage du Prod manager n’ouvre les réassorts qu’allumé', async () => {
    granted = (permission) => permission === 'production_resupply:read';
    const land = (): Promise<unknown> =>
      Promise.resolve(TestBed.runInInjectionContext(() => prodManagerLanding(null as never)));

    enabled.set(true);
    boot();
    expect(await land()).toBe('/prod-manager/reassorts');

    enabled.set(false);
    boot();
    expect(await land()).toBe('/prod-manager/previsionnel');
    granted = () => true;
  });
});
