import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { OrderCutoffView, StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { OrderCutoffsService } from '../order-cutoffs.service';
import { CutoffsSection } from './cutoffs-section';

/**
 * Option A de `plan-reglages-commandes.md` (§2) : seule la ligne générale
 * s'édite, sous `lfc_order_settings:write` ; une règle par point ou par jour se
 * lit, marquée « non reprise », sans aucun geste.
 */
const GENERAL: OrderCutoffView = {
  id: 'cut_1',
  pickupAddressId: null,
  pickupLabel: null,
  weekday: null,
  daysBefore: 1,
  time: '19:00',
  graceMinutes: 30,
};

const BY_POINT: OrderCutoffView = {
  id: 'cut_2',
  pickupAddressId: 'pk_1',
  pickupLabel: 'Labo',
  weekday: 'sun',
  daysBefore: 2,
  time: '12:00',
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

const root = (fixture: ComponentFixture<CutoffsSection>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const buttons = (fixture: ComponentFixture<CutoffsSection>): readonly string[] =>
  Array.from(root(fixture).querySelectorAll('button')).map((b) => (b.textContent ?? '').trim());

describe('CutoffsSection — la limite générale', () => {
  it('avec `lfc_order_settings:write`, propose de modifier la ligne générale, et elle seule', async () => {
    const fixture = await mount(
      ['lfc_order_settings:read', 'lfc_order_settings:write'],
      [BY_POINT, GENERAL],
    );

    expect(buttons(fixture)).toEqual(['Modifier']);
    expect(root(fixture).querySelector('[data-cutoff-general]')?.textContent).toContain(
      'La veille à 19:00',
    );
  });

  it('propose de poser la ligne générale quand elle manque', async () => {
    const fixture = await mount(['lfc_order_settings:write'], []);

    expect(buttons(fixture)).toEqual(['Poser la limite générale']);
    expect(root(fixture).textContent).toContain('Aucune limite générale');
  });

  it('🔴 sans `lfc_order_settings:write`, montre la règle sans aucun geste', async () => {
    const fixture = await mount(['lfc_order_settings:read', 'b2b_settings:write'], [GENERAL]);

    expect(root(fixture).querySelector('[data-cutoff-general]')).not.toBeNull();
    expect(buttons(fixture)).toEqual([]);
  });

  it('lit les règles par point ou par jour sans geste, marquées non reprises', async () => {
    const fixture = await mount(['lfc_order_settings:write'], [BY_POINT, GENERAL]);

    const legacy = root(fixture).querySelector('[data-cutoff-legacy]');
    expect(legacy?.textContent).toContain('Labo');
    expect(legacy?.textContent).toContain('Non reprise');
    expect(legacy?.querySelector('button')).toBeNull();
  });
});
