import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { OrderCutoffWaiversService } from '../../../commandes/order-cutoff-waivers.service';
import { NotifyService } from '../../../notify.service';
import { OrderCutoffSettingsService } from '../order-cutoff-settings.service';
import { OrderCutoffsService } from '../order-cutoffs.service';
import { OrderCutoffsPage } from './order-cutoffs-page';

/**
 * **Heure limite de commande** (plan-reglages-commandes.md §3.2) : la limite
 * générale, les dérogations sous leur propre droit, la carte des particuliers
 * « à venir », et le renvoi au référentiel sous `pim_catalog:read`.
 */
async function mount(
  permissions: readonly StaffPermission[],
  enabled = true,
): Promise<ComponentFixture<OrderCutoffsPage>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [OrderCutoffsPage],
    providers: [
      provideRouter([]),
      { provide: OrderCutoffsService, useValue: { general: () => Promise.resolve(null) } },
      {
        provide: OrderCutoffSettingsService,
        useValue: {
          read: () =>
            Promise.resolve({ enabled, sameDayAllowed: false, updatedAt: null, updatedBy: null }),
          update: () => Promise.resolve(),
        },
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
  it('monte la limite générale et la carte des particuliers « à venir »', async () => {
    const fixture = await mount(['lfc_order_settings:read']);

    expect(root(fixture).querySelector('app-cutoffs-section')).not.toBeNull();
    expect(root(fixture).querySelector('[data-b2c-card]')?.textContent).toContain(
      'Clientèle particulière',
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

  it('monte l’interrupteur de l’heure limite générale en tête', async () => {
    const fixture = await mount(['lfc_order_settings:read']);

    const blocks = root(fixture).querySelector('.blocks');
    expect(blocks?.firstElementChild?.tagName.toLowerCase()).toBe('app-cutoff-switch-card');
  });

  it('désactivée, grise la limite générale et récrit la carte des particuliers', async () => {
    const fixture = await mount(['lfc_order_settings:read'], false);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root(fixture).querySelector('app-cutoffs-section [data-cutoff-dormant]')).not.toBeNull();
    expect(root(fixture).querySelector('[data-b2c-card]')?.textContent).toContain(
      "plan de production de la journée n'est pas arrêté",
    );
  });
});
