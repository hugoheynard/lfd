import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  OrderCutoffSettingsPatch,
  OrderCutoffSettingsView,
  StaffPermission,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { OrderCutoffSettingsService } from '../order-cutoff-settings.service';
import { ResupplyCutoffCard } from './resupply-cutoff-card';

/** L'heure limite du réassort (lot R3a, 2026-10-21) : « la veille, HH:MM », opposée à « Pour demain ». */
async function mount(
  permissions: readonly StaffPermission[],
  initial: OrderCutoffSettingsView,
): Promise<{ fixture: ComponentFixture<ResupplyCutoffCard>; patches: OrderCutoffSettingsPatch[] }> {
  const patches: OrderCutoffSettingsPatch[] = [];
  let current = initial;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ResupplyCutoffCard],
    providers: [
      {
        provide: OrderCutoffSettingsService,
        useValue: {
          read: (): Promise<OrderCutoffSettingsView> => Promise.resolve(current),
          update: (patch: OrderCutoffSettingsPatch): Promise<void> => {
            patches.push(patch);
            current = {
              ...current,
              resupplyCutoffTime: patch.resupplyCutoffTime ?? current.resupplyCutoffTime,
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
  const fixture = TestBed.createComponent(ResupplyCutoffCard);
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

const root = (fixture: ComponentFixture<ResupplyCutoffCard>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

function typeTime(fixture: ComponentFixture<ResupplyCutoffCard>, value: string): void {
  const input = root(fixture).querySelector<HTMLInputElement>('[data-resupply-cutoff-time]');
  if (input === null) {
    throw new Error('le champ de l’heure manque');
  }
  input.value = value;
  input.dispatchEvent(new Event('change'));
  fixture.detectChanges();
}

describe('ResupplyCutoffCard', () => {
  it('dit l’heure, l’arrêt à la plus tardive, et qu’elle vise « Pour demain » seulement', async () => {
    const { fixture } = await mount(['lfc_order_settings:read'], VIEW);

    const text = root(fixture).textContent ?? '';
    expect(text).toContain('La veille, 20:00');
    expect(text).toContain('la plus tardive');
    expect(text).toContain('« Pour demain »');
    expect(text).toContain('« Au plus tôt » n');
    expect(root(fixture).querySelector('[data-resupply-cutoff-time]')).toBeNull();
  });

  it('enregistre une nouvelle heure sous le droit d’écriture, en n’envoyant que sa clé', async () => {
    const { fixture, patches } = await mount(
      ['lfc_order_settings:read', 'lfc_order_settings:write'],
      VIEW,
    );
    typeTime(fixture, '21:30');
    await fixture.componentInstance['save']();
    fixture.detectChanges();

    expect(patches).toEqual([{ resupplyCutoffTime: '21:30' }]);
    expect(root(fixture).textContent).toContain('La veille, 21:30');
  });

  it('n’envoie rien tant que l’heure est vide ou inchangée', async () => {
    const { fixture, patches } = await mount(
      ['lfc_order_settings:read', 'lfc_order_settings:write'],
      VIEW,
    );
    await fixture.componentInstance['save']();
    typeTime(fixture, '');
    await fixture.componentInstance['save']();
    fixture.detectChanges();

    expect(patches).toEqual([]);
    expect(root(fixture).textContent).toContain('format HH:MM');
  });
});
