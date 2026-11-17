import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { StaffPermission, UnplacedProductsOfDayView } from '@lfd/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { parisToday } from '../../../shared/paris-today';
import { WorkstationsService } from '../../workstations.service';
import { DAY_CHECK_MS, UnplacedProductsAlert } from './unplaced-products-alert';

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
): Promise<{ el: HTMLElement; asked: string[]; settle: () => Promise<void> }> {
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
  const settle = async (): Promise<void> => {
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  };
  await settle();
  return { el: fixture.nativeElement as HTMLElement, asked, settle };
}

describe('l’alerte du Prod manager', () => {
  it('en mode prod, dit le compte et mène à la page Postes filtrée « à ranger »', async () => {
    const { el } = await mount(() => Promise.resolve(day({})));

    expect(el.querySelector('[data-unplaced-alert]')?.textContent).toContain(
      '2 produits du jour à ranger',
    );
    expect(el.querySelector('[data-unplaced-link]')?.getAttribute('href')).toBe(
      '/reglages/production/postes?filtre=a-ranger',
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

  it('compte aussi les articles du jour hors catalogue, qui ne peuvent pas recevoir de poste', async () => {
    const { el } = await mount(() =>
      Promise.resolve(
        day({ products: [], offCatalog: [{ sku: 'OLD-1', productName: 'Ancienne tarte' }] }),
      ),
    );

    expect(el.querySelector('[data-unplaced-off-catalog]')?.textContent).toContain(
      '1 article du jour hors catalogue',
    );
  });

  describe('se relit', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('quand on revient sur l’onglet', async () => {
      let products = day({}).products;
      const { el, asked, settle } = await mount(() => Promise.resolve(day({ products })));
      products = products.slice(0, 1);

      document.dispatchEvent(new Event('visibilitychange'));
      await settle();

      expect(asked).toHaveLength(2);
      expect(el.querySelector('[data-unplaced-alert]')?.textContent).toContain(
        '1 produit du jour à ranger',
      );
    });

    it('quand le jour change, et pas avant', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
      // Midi à Paris, aujourd'hui : une minute de plus ne change pas le jour.
      const now = new Date(`${parisToday()}T11:00:00Z`);
      vi.setSystemTime(now);
      const { asked } = await mount(() => Promise.resolve(day({})));

      vi.advanceTimersByTime(DAY_CHECK_MS);
      expect(asked).toHaveLength(1);

      vi.setSystemTime(new Date(now.getTime() + 24 * 60 * 60 * 1000));
      vi.advanceTimersByTime(DAY_CHECK_MS);
      expect(asked).toHaveLength(2);
      expect(asked[1]).not.toBe(asked[0]);
    });
  });
});
