import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { StaffPermission, UnplacedProductsOfDayView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { WorkstationsService } from '../../workstations.service';
import { UnplacedProductsAlert } from './unplaced-products-alert';

function day(over: Partial<UnplacedProductsOfDayView>): UnplacedProductsOfDayView {
  return {
    date: '2026-11-16',
    mode: 'workstation',
    closed: false,
    products: [
      { productSku: 'QUI', productName: 'Quiche', skus: ['QUI-6', 'QUI-8'] },
      { productSku: 'TAR', productName: 'Tarte', skus: ['TAR-6'] },
    ],
    offCatalog: [],
    ...over,
  };
}

async function mount(
  unplaced: () => Promise<UnplacedProductsOfDayView>,
  granted: readonly StaffPermission[] = ['production_plan:read', 'production_workstations:read'],
): Promise<{ el: HTMLElement; asked: string[] }> {
  const asked: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [UnplacedProductsAlert],
    providers: [
      provideRouter([]),
      {
        provide: WorkstationsService,
        useValue: {
          unplaced: (date: string) => {
            asked.push(date);
            return unplaced();
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
  const fixture = TestBed.createComponent(UnplacedProductsAlert);
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
  return { el: fixture.nativeElement as HTMLElement, asked };
}

describe('l’alerte du Prod manager', () => {
  it('en mode prod, dit le compte et mène à la page Postes filtrée « à ranger »', async () => {
    const { el } = await mount(() => Promise.resolve(day({})));

    expect(el.querySelector('[data-unplaced-alert]')?.textContent).toContain(
      '2 produits du jour à ranger',
    );
    expect(el.querySelector('[data-unplaced-link]')?.getAttribute('href')).toBe(
      '/prod-manager/postes?filtre=a-ranger',
    );
  });

  it('se tait en mode boutique', async () => {
    const { el } = await mount(() => Promise.resolve(day({ mode: 'shelf' })));

    expect(el.querySelector('[data-unplaced-alert]')).toBeNull();
  });

  it('se tait quand tout est rangé, ou que la lecture échoue', async () => {
    expect(
      (await mount(() => Promise.resolve(day({ products: [] })))).el.querySelector(
        '[data-unplaced-alert]',
      ),
    ).toBeNull();
    expect(
      (await mount(() => Promise.reject(new Error('panne')))).el.querySelector(
        '[data-unplaced-alert]',
      ),
    ).toBeNull();
  });

  it('ne lit rien sans le droit du prévisionnel', async () => {
    const { asked } = await mount(() => Promise.resolve(day({})), ['production_workstations:read']);

    expect(asked).toEqual([]);
  });

  it('sans le droit des postes, dit le compte sans lien', async () => {
    const { el } = await mount(() => Promise.resolve(day({})), ['production_plan:read']);

    expect(el.querySelector('[data-unplaced-alert]')).not.toBeNull();
    expect(el.querySelector('[data-unplaced-link]')).toBeNull();
  });
});
