import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ProductionSettingsView, StaffPermission, WorkstationsPageView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { ProductionSettingsService } from '../production-settings.service';
import { WorkstationsService } from '../workstations.service';
import { WorkstationsPage } from './workstations-page';

const PAGE: WorkstationsPageView = {
  workstations: [{ id: 'ws_p', name: 'Pâtisserie', position: 0, trackingLevel: null }],
  products: [
    {
      productSku: 'QUI',
      productName: 'Quiche',
      family: { id: 'fam_t', name: 'Traiteur salé', position: 1 },
      workstationId: null,
      position: null,
      workstations: [],
      ordered: true,
      variants: [],
    },
    {
      productSku: 'PAC',
      productName: 'Pain au chocolat',
      family: { id: 'fam_v', name: 'Viennoiserie', position: 0 },
      workstationId: null,
      position: null,
      workstations: [],
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
      provideRouter([]),
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
  it('range la page en quatre onglets, Postes ouvert d’abord, une carte par onglet', async () => {
    const { fixture } = await mount(
      () => Promise.resolve(PAGE),
      ['production_workstations:read', 'production_settings:read'],
    );
    const el = fixture.nativeElement as HTMLElement;
    const page = fixture.componentInstance;

    expect(el.querySelector('fold-page-layout')).not.toBeNull();
    expect(page['tabs']().map((tab) => tab.label)).toEqual([
      'Postes',
      'Pile de poste',
      'Produits',
      'Général fournil',
    ]);
    expect(el.querySelector('[data-workstation-list]')).not.toBeNull();
    expect(el.querySelector('[data-workstation-products]')).toBeNull();

    const shows = async (tab: 'stack' | 'products' | 'general', selector: string) => {
      page['tab'].set(tab);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(el.querySelector(selector)).not.toBeNull();
      expect(el.querySelector('[data-workstation-list]')).toBeNull();
    };
    await shows('products', '[data-workstation-products]');
    await shows('general', '[data-grouping-card]');
    expect(page['unplacedOrdered']()).toBe(1);
    expect(page['display']()).toEqual(SETTINGS.display);
  });

  it('ouvre l’onglet Produits quand on arrive pour ranger (?filtre=a-ranger)', async () => {
    const { fixture } = await mount(() => Promise.resolve(PAGE), ['production_workstations:read']);
    fixture.componentRef.setInput('filtre', 'a-ranger');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance['tab']()).toBe('products');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-workstation-products]'),
    ).not.toBeNull();
  });

  it('une carte de poste ouvre l’onglet Produits ou la pile, sur ce poste', async () => {
    const { fixture } = await mount(async () => PAGE, ['production_workstations:write']);
    const page = fixture.componentInstance;
    const el = fixture.nativeElement as HTMLElement;

    el.querySelector<HTMLButtonElement>('[data-workstation="ws_p"] [data-open-products]')?.click();
    fixture.detectChanges();
    expect(page['tab']()).toBe('products');
    expect(page['focusedStation']()).toBe('ws_p');
    expect(el.querySelector('[data-workstation-products]')).not.toBeNull();

    page['openOn']('stack', 'ws_p');
    fixture.detectChanges();
    expect(page['tab']()).toBe('stack');
    expect(el.querySelector('[data-workstation-list]')).toBeNull();
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
