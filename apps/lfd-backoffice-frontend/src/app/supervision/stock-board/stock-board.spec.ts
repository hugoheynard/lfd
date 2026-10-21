import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { DayStockOverviewView, StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { type ColumnState, FAILED, LOADING, ready } from '../column-state';
import { StockBoard } from './stock-board';

/** L'onglet Stock de la Supervision (lot S1) : il lit, il n'agit pas. */
const VIEW: DayStockOverviewView = {
  serviceDay: '2026-01-03',
  sites: [
    {
      siteId: 'village',
      siteLabel: 'Val Village',
      resupplies: [
        {
          resupplyId: 'r1',
          name: 'Vitrine du matin',
          target: 'tomorrow',
          origin: 'bakehouse',
          state: 'frozen',
          pieces: 14,
        },
        {
          resupplyId: 'r2',
          name: null,
          target: 'asap',
          origin: 'counter',
          state: 'received',
          pieces: 6,
        },
      ],
      products: [
        { sku: 'TAR', label: 'Tartelette', stock: 0, alert: 'out_of_stock', expected: 0 },
        { sku: 'CRO', label: 'Croissant', stock: 6, alert: null, expected: 10 },
      ],
    },
    { siteId: 'labo', siteLabel: null, resupplies: [], products: [] },
  ],
};

function mount(
  state: ColumnState<DayStockOverviewView>,
  permissions: readonly StaffPermission[] = [],
) {
  const granted = signal(permissions);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [StockBoard],
    providers: [
      provideRouter([]),
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => granted().includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(StockBoard);
  fixture.componentRef.setInput('state', state);
  let retried = 0;
  fixture.componentInstance.retry.subscribe(() => (retried += 1));
  fixture.detectChanges();
  return { root: fixture.nativeElement as HTMLElement, retried: () => retried };
}

describe('StockBoard', () => {
  it('rend une carte par point : réassorts (nom, visée, origine, état), puis les produits', () => {
    const { root } = mount(ready(VIEW));

    const village = root.querySelector('[data-stock-site="village"]');
    const first = village?.querySelector('[data-stock-resupply="r1"]')?.textContent ?? '';
    expect(first).toContain('Vitrine du matin');
    expect(first).toContain('Pour demain');
    expect(first).toContain('Fournil');
    expect(first).toContain('Figé au plan');
    expect(village?.querySelector('[data-stock-resupply="r2"]')?.textContent).toContain(
      'Réceptionné',
    );
    const rows = [...(village?.querySelectorAll('[data-stock-product]') ?? [])];
    expect(rows.map((row) => row.getAttribute('data-stock-product'))).toEqual(['TAR', 'CRO']);
    expect(rows[0]?.textContent).toContain('Rupture');
    expect(rows[1]?.textContent).toContain('10');
  });

  it('dit le point vide, et nomme par son identifiant un point que la table ne connaît plus', () => {
    const { root } = mount(ready(VIEW));

    const labo = root.querySelector('[data-stock-site="labo"]');
    expect(labo?.querySelector('[data-stock-site-empty]')).not.toBeNull();
    expect(labo?.textContent).toContain('labo');
  });

  it('ne propose aucun geste ; le renvoi au réassort suit le droit de Prod manager', () => {
    expect(mount(ready(VIEW)).root.querySelector('[data-stock-open]')).toBeNull();
    const { root } = mount(ready(VIEW), ['production_plan:read']);

    expect(root.querySelector('[data-stock-open]')?.getAttribute('href')).toBe(
      '/prod-manager/reassorts',
    );
    expect(root.querySelectorAll('button')).toHaveLength(0);
  });

  it('passe par les états fold : chargement, échec réessayable, vide', () => {
    expect(mount(LOADING).root.querySelector('fold-loading')).not.toBeNull();
    const failed = mount(FAILED);
    failed.root.querySelector<HTMLButtonElement>('fold-empty-state button')?.click();
    expect(failed.retried()).toBe(1);
    const empty = mount(ready({ serviceDay: '2026-01-03', sites: [] }));
    expect(empty.root.querySelector('[data-stock-empty]')).not.toBeNull();
  });

  it("garde le stock à l'écran quand une relecture échoue, et le dit", () => {
    const { root } = mount({ status: 'ready', data: VIEW, stale: true });

    expect(root.querySelector('[data-stock-stale]')).not.toBeNull();
    expect(root.querySelector('[data-stock-site="village"]')).not.toBeNull();
  });
});
