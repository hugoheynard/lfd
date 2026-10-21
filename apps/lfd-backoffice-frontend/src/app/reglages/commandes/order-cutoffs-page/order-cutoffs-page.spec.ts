import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  DEFAULT_ORDER_CUTOFF_SETTINGS,
  type OrderCutoffView,
  type StaffPermission,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { OrderCutoffWaiversService } from '../../../commandes/order-cutoff-waivers.service';
import { OrderLateFeeService } from '../../../comptabilite/order-late-fee/order-late-fee.service';
import { NotifyService } from '../../../notify.service';
import { OrderCutoffSettingsService } from '../order-cutoff-settings.service';
import { OrderCutoffsService } from '../order-cutoffs.service';
import { OrderCutoffsPage } from './order-cutoffs-page';

/**
 * **Heure limite de commande** (plan-reglages-commandes.md §3.2) : la limite
 * générale (pour tout le monde, 2026-10-21), les dérogations sous leur propre
 * droit, et le renvoi au référentiel sous `pim_catalog:read`.
 */
const GENERAL: OrderCutoffView = {
  id: 'cutoff-1',
  pickupAddressId: null,
  pickupLabel: null,
  weekday: null,
  daysBefore: 1,
  time: '23:00',
  graceMinutes: 60,
};

async function mount(
  permissions: readonly StaffPermission[],
  general: OrderCutoffView | null = null,
): Promise<ComponentFixture<OrderCutoffsPage>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [OrderCutoffsPage],
    providers: [
      provideRouter([]),
      { provide: OrderCutoffsService, useValue: { general: () => Promise.resolve(general) } },
      { provide: OrderLateFeeService, useValue: { read: () => Promise.resolve(null) } },
      {
        provide: OrderCutoffSettingsService,
        useValue: { read: () => Promise.resolve(DEFAULT_ORDER_CUTOFF_SETTINGS) },
      },
      { provide: OrderCutoffWaiversService, useValue: { listOpen: () => Promise.resolve([]) } },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(OrderCutoffsPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const root = (fixture: ComponentFixture<OrderCutoffsPage>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('OrderCutoffsPage', () => {
  it('monte la limite générale, sans carte par clientèle (modèle du 2026-10-21)', async () => {
    const fixture = await mount(['lfc_order_settings:read']);

    expect(root(fixture).querySelector('app-cutoffs-section')).not.toBeNull();
    expect(root(fixture).querySelector('[data-b2c-card]')).toBeNull();
  });

  it('porte la limite du réassort boutique, sans effet encore (2026-10-21)', async () => {
    const fixture = await mount(['lfc_order_settings:read']);

    expect(root(fixture).querySelector('app-resupply-cutoff-card')?.textContent).toContain(
      'commandé au fournil',
    );
  });

  it('ne montre ni dérogations ni renvoi sans leurs droits', async () => {
    const fixture = await mount(['lfc_order_settings:read']);

    expect(root(fixture).querySelector('app-cutoff-waivers-card')).toBeNull();
    expect(root(fixture).querySelector('[data-pim-link]')).toBeNull();
  });

  it('montre les dérogations sous `b2b_order_waivers:read`', async () => {
    const fixture = await mount(['lfc_order_settings:read', 'b2b_order_waivers:read']);

    expect(root(fixture).querySelector('app-cutoff-waivers-card')).not.toBeNull();
  });

  it('renvoie au référentiel sous `pim_catalog:read`, par un simple lien', async () => {
    const fixture = await mount(['lfc_order_settings:read', 'pim_catalog:read']);

    const link = root(fixture).querySelector('[data-pim-link] a');
    expect(link?.getAttribute('href')).toBe('/pim/limites-de-commande');
  });

  /** L'interrupteur est retiré, et le jour même a sa page (2026-10-21). */
  it('ne monte plus ni l’interrupteur ni le jour même', async () => {
    const fixture = await mount(['lfc_order_settings:read']);

    expect(root(fixture).querySelector('app-cutoff-switch-card')).toBeNull();
    expect(root(fixture).querySelector('[data-same-day]')).toBeNull();
  });

  /** Le rattrapage réuni sous l'heure (Hugo, 2026-10-21) : durée, dérogations, surtaxe. */
  it('réunit la durée du rattrapage, les dérogations et la surtaxe dans la section « Rattrapage »', async () => {
    const fixture = await mount(['lfc_order_settings:read', 'b2b_order_waivers:read'], GENERAL);

    const section = root(fixture).querySelector('[data-grace-section]');
    expect(section?.querySelector('[data-grace-duration]')?.textContent).toContain('1 heure');
    expect(section?.querySelector('app-cutoff-waivers-card')).not.toBeNull();
    expect(section?.querySelector('app-late-fee-summary-card')).not.toBeNull();
  });

  it('dit que le rattrapage n’existe pas tant que l’heure n’est pas posée', async () => {
    const fixture = await mount(['lfc_order_settings:read']);

    expect(root(fixture).querySelector('[data-grace-duration]')?.textContent).toContain(
      'pas posée',
    );
  });
});
