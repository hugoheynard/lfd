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

/** La limite du réassort (Hugo, 2026-10-21) : opposée au réassort « Pour demain » depuis le lot R1. */
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
              resupplySubjectToCutoff:
                patch.resupplySubjectToCutoff ?? current.resupplySubjectToCutoff,
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
  resupplySubjectToCutoff: true,
  updatedAt: null,
  updatedBy: null,
};

const root = (fixture: ComponentFixture<ResupplyCutoffCard>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('ResupplyCutoffCard', () => {
  it('dit l’état, et qu’il vise le réassort « Pour demain » seulement', async () => {
    const { fixture } = await mount(['lfc_order_settings:read'], VIEW);

    const text = root(fixture).textContent ?? '';
    expect(text).toContain('Soumis à l’heure limite');
    expect(text).toContain('« Pour demain »');
    expect(text).toContain('« Au plus tôt » n');
    expect(root(fixture).querySelector('[data-resupply-cutoff-toggle]')).toBeNull();
  });

  it('dit « sans limite » quand le réglage est levé', async () => {
    const { fixture } = await mount(['lfc_order_settings:read'], {
      ...VIEW,
      resupplySubjectToCutoff: false,
    });

    expect(root(fixture).querySelector('[data-resupply-cutoff-value]')?.textContent).toContain(
      'Sans limite',
    );
  });

  it('bascule sous le droit d’écriture, en n’envoyant que sa clé', async () => {
    const { fixture, patches } = await mount(
      ['lfc_order_settings:read', 'lfc_order_settings:write'],
      VIEW,
    );
    await fixture.componentInstance['toggle']();
    fixture.detectChanges();

    expect(patches).toEqual([{ resupplySubjectToCutoff: false }]);
    expect(root(fixture).textContent).toContain('Sans limite');
  });
});
