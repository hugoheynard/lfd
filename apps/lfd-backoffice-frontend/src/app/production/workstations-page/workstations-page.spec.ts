import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { ProductionSettingsView, StaffPermission, WorkstationsPageView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { ProductionSettingsService } from '../production-settings.service';
import { WorkstationsService } from '../workstations.service';
import { WorkstationsPage } from './workstations-page';

const PAGE: WorkstationsPageView = {
  workstations: [{ id: 'ws_p', name: 'Pâtisserie', position: 0 }],
  products: [
    {
      productSku: 'QUI',
      productName: 'Quiche',
      family: { id: 'fam_t', name: 'Traiteur salé', position: 1 },
      workstationId: null,
      ordered: true,
      variants: [],
    },
    {
      productSku: 'PAC',
      productName: 'Pain au chocolat',
      family: { id: 'fam_v', name: 'Viennoiserie', position: 0 },
      workstationId: null,
      ordered: false,
      variants: [],
    },
  ],
  offCatalog: [],
  unplacedCount: 2,
};

const SETTINGS: ProductionSettingsView = {
  automaticClose: null,
  closedDays: [],
  tranches: { mode: 'fixed', fixedTranches: [] },
  display: { showSubcategories: false, grouping: 'shelf' },
};

async function mount(
  page: () => Promise<WorkstationsPageView>,
  granted: readonly StaffPermission[],
): Promise<{ fixture: ComponentFixture<WorkstationsPage>; settingsReads: number[] }> {
  const settingsReads: number[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [WorkstationsPage],
    providers: [
      { provide: WorkstationsService, useValue: { page } },
      {
        provide: ProductionSettingsService,
        useValue: {
          settings: async () => {
            settingsReads.push(1);
            return SETTINGS;
          },
        },
      },
      {
        provide: PermissionsStore,
        useValue: {
          can: (permission: StaffPermission) => granted.includes(permission),
          loaded: signal(true),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(WorkstationsPage);
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
  return { fixture, settingsReads };
}

describe('la page Postes', () => {
  it('montre les trois cartes, et compte les produits commandés sans poste', async () => {
    const { fixture } = await mount(
      () => Promise.resolve(PAGE),
      ['production_workstations:read', 'production_settings:read'],
    );
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('fold-page-layout')).not.toBeNull();
    expect(el.querySelector('[data-grouping-card]')).not.toBeNull();
    expect(el.querySelector('[data-workstation-list]')).not.toBeNull();
    expect(el.querySelector('[data-workstation-products]')).not.toBeNull();
    expect(fixture.componentInstance['unplacedOrdered']()).toBe(1);
    expect(fixture.componentInstance['display']()).toEqual(SETTINGS.display);
  });

  it('ne lit pas le réglage sans son droit', async () => {
    const { fixture, settingsReads } = await mount(
      () => Promise.resolve(PAGE),
      ['production_workstations:read'],
    );

    expect(settingsReads).toEqual([]);
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-grouping-mode]')).toBeNull();
  });

  it('passe par fold pour l’erreur de lecture, avec de quoi réessayer', async () => {
    const { fixture } = await mount(
      () => Promise.reject(new Error('panne')),
      ['production_workstations:read'],
    );
    const empty = (fixture.nativeElement as HTMLElement).querySelector('fold-empty-state');

    expect(empty?.getAttribute('tone')).toBe('alert');
    expect(empty?.querySelector('[data-retry]')).not.toBeNull();
  });
});
