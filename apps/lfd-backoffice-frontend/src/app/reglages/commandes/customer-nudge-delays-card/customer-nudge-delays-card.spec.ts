import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  OrderCutoffSettingsPatch,
  OrderCutoffSettingsView,
  StaffPermission,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { OrderCutoffSettingsService } from '../order-cutoff-settings.service';
import { CustomerNudgeDelaysCard } from './customer-nudge-delays-card';

/** Les délais des deux relances d'un retrait en retard (2026-10-25), sur la page de l'heure limite. */
async function mount(
  permissions: readonly StaffPermission[],
  initial: OrderCutoffSettingsView,
): Promise<{
  fixture: ComponentFixture<CustomerNudgeDelaysCard>;
  patches: OrderCutoffSettingsPatch[];
}> {
  const patches: OrderCutoffSettingsPatch[] = [];
  let current = initial;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CustomerNudgeDelaysCard],
    providers: [
      {
        provide: OrderCutoffSettingsService,
        useValue: {
          read: (): Promise<OrderCutoffSettingsView> => Promise.resolve(current),
          update: (patch: OrderCutoffSettingsPatch): Promise<void> => {
            patches.push(patch);
            current = {
              ...current,
              pickupReminderDelayMinutes:
                patch.pickupReminderDelayMinutes ?? current.pickupReminderDelayMinutes,
              delayWarningDelayMinutes:
                patch.delayWarningDelayMinutes ?? current.delayWarningDelayMinutes,
            };
            return Promise.resolve();
          },
        },
      },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(CustomerNudgeDelaysCard);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, patches };
}

const VIEW: OrderCutoffSettingsView = {
  sameDayAllowed: false,
  resupplyCutoffTime: '20:00',
  pickupReminderDelayMinutes: 0,
  delayWarningDelayMinutes: 0,
  updatedAt: null,
  updatedBy: null,
};

const WRITE: readonly StaffPermission[] = ['lfc_order_settings:read', 'lfc_order_settings:write'];

const root = (fixture: ComponentFixture<CustomerNudgeDelaysCard>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('CustomerNudgeDelaysCard', () => {
  it('dit les deux gestes, comptés depuis la fin du créneau', async () => {
    const { fixture } = await mount(['lfc_order_settings:read'], VIEW);

    const text = root(fixture).textContent ?? '';
    expect(text).toContain('Rappel au client : minutes après la fin du créneau');
    expect(text).toContain('Avertir le client : minutes après la fin du créneau');
    expect(root(fixture).querySelector('[data-customer-nudge-delays-save]')).toBeNull();
  });

  it('n’envoie que les délais changés, puis relit', async () => {
    const { fixture, patches } = await mount(WRITE, VIEW);
    fixture.componentInstance['warning'].set(15);
    await fixture.componentInstance['save']();
    fixture.detectChanges();

    expect(patches).toEqual([{ delayWarningDelayMinutes: 15 }]);
    expect(fixture.componentInstance['settings']()?.delayWarningDelayMinutes).toBe(15);
  });

  it('n’envoie rien tant qu’un champ est vidé ou que rien n’a changé', async () => {
    const { fixture, patches } = await mount(WRITE, VIEW);
    await fixture.componentInstance['save']();
    fixture.componentInstance['reminder'].set(null);
    fixture.componentInstance['warning'].set(5);
    await fixture.componentInstance['save']();

    expect(patches).toEqual([]);
  });

  it('montre le refus du serveur et garde le brouillon', async () => {
    const { fixture } = await mount(WRITE, VIEW);
    const service = TestBed.inject(OrderCutoffSettingsService);
    service.update = (): Promise<void> => Promise.reject(new Error('refusé'));
    fixture.componentInstance['reminder'].set(10);
    await fixture.componentInstance['save']();
    fixture.detectChanges();

    expect(root(fixture).textContent).toContain('Les délais n’ont pas pu être enregistrés.');
    expect(fixture.componentInstance['reminder']()).toBe(10);
  });
});
