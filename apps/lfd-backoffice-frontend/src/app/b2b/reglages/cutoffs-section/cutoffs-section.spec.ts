import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { OrderCutoffView, StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { OrderCutoffsService } from '../order-cutoffs.service';
import { CutoffsSection } from './cutoffs-section';

/**
 * Écart 5 de `droits-des-commandes.md` (corrigé le 2026-10-12) : les heures
 * limites se lisent sous `b2b_settings:read`, mais `POST`/`DELETE
 * /admin/order-cutoffs` exigent `b2b_settings:write`. Sans lui, aucun geste
 * d'écriture n'est proposé.
 */
const RULE: OrderCutoffView = {
  id: 'cut_1',
  pickupAddressId: null,
  pickupLabel: null,
  weekday: null,
  daysBefore: 1,
  time: '18:00',
  graceMinutes: 0,
};

async function mount(
  permissions: readonly StaffPermission[],
  rules: readonly OrderCutoffView[],
): Promise<ComponentFixture<CutoffsSection>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CutoffsSection],
    providers: [
      { provide: OrderCutoffsService, useValue: { list: () => Promise.resolve(rules) } },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(CutoffsSection);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const buttons = (fixture: ComponentFixture<CutoffsSection>): readonly string[] =>
  Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).map((b) =>
    (b.textContent ?? '').trim(),
  );

describe('CutoffsSection — droits', () => {
  it('avec `b2b_settings:write`, propose ajouter, modifier et supprimer', async () => {
    const fixture = await mount(['b2b_settings:read', 'b2b_settings:write'], [RULE]);

    expect(buttons(fixture)).toEqual(['Ajouter une règle', 'Modifier', 'Supprimer']);
  });

  it('🔴 sans `b2b_settings:write`, montre les règles sans aucun geste', async () => {
    const fixture = await mount(['b2b_settings:read'], [RULE]);

    expect((fixture.nativeElement as HTMLElement).querySelector('.rule')).not.toBeNull();
    expect(buttons(fixture)).toEqual([]);
  });
});
