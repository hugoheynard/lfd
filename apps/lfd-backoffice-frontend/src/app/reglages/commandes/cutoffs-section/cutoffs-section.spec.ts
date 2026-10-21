import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { OrderCutoffView, StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { OrderCutoffsService } from '../order-cutoffs.service';
import { CutoffsSection } from './cutoffs-section';

/**
 * Une seule règle, la générale (Hugo, 2026-10-21, schéma des réglages §4,
 * point 4) : elle s'édite sous `lfc_order_settings:write`, et l'écran ne liste
 * plus de règles par point ou par jour.
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

async function mount(
  permissions: readonly StaffPermission[],
  rule: OrderCutoffView | null,
): Promise<ComponentFixture<CutoffsSection>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CutoffsSection],
    providers: [
      { provide: OrderCutoffsService, useValue: { general: () => Promise.resolve(rule) } },
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
    const fixture = await mount(['lfc_order_settings:read', 'lfc_order_settings:write'], GENERAL);

    expect(buttons(fixture)).toEqual(['Modifier']);
    expect(root(fixture).querySelector('[data-cutoff-general]')?.textContent).toContain(
      'La veille à 19:00',
    );
  });

  it('propose de poser la ligne générale quand elle manque', async () => {
    const fixture = await mount(['lfc_order_settings:write'], null);

    expect(buttons(fixture)).toEqual(['Poser la limite générale']);
    expect(root(fixture).textContent).toContain('Aucune limite générale');
  });

  it('🔴 sans `lfc_order_settings:write`, montre la règle sans aucun geste', async () => {
    const fixture = await mount(['lfc_order_settings:read', 'b2b_settings:write'], GENERAL);

    expect(root(fixture).querySelector('[data-cutoff-general]')).not.toBeNull();
    expect(buttons(fixture)).toEqual([]);
  });

  it('ne liste plus aucune règle « non reprise »', async () => {
    const fixture = await mount(['lfc_order_settings:write'], GENERAL);

    expect(root(fixture).querySelector('[data-cutoff-legacy]')).toBeNull();
    expect(root(fixture).textContent).not.toContain('Non reprise');
  });
});

/**
 * Lot O3 (`plan-reglages-commandes.md` §8.1, B1) : l'heure limite générale
 * désactivée, la section grise ce qui n'appartient qu'à elle et le dit — la
 * règle reste lisible et modifiable, la réactivation la remettra telle quelle.
 */
describe('CutoffsSection — la règle qui dort', () => {
  it('désactivée, dit que la limite et son rattrapage ne s’appliquent pas', async () => {
    const fixture = await mount(['lfc_order_settings:write'], GENERAL);
    fixture.componentRef.setInput('dormant', true);
    fixture.detectChanges();

    expect(root(fixture).querySelector('[data-cutoff-dormant]')?.textContent).toContain(
      "ne s'appliquent pas",
    );
    expect(root(fixture).querySelector('fold-card')?.classList.contains('dormant')).toBe(true);
    expect(root(fixture).querySelector('[data-cutoff-general]')).not.toBeNull();
    expect(buttons(fixture)).toEqual(['Modifier']);
  });

  it('activée, ne dit rien de plus', async () => {
    const fixture = await mount(['lfc_order_settings:write'], GENERAL);

    expect(root(fixture).querySelector('[data-cutoff-dormant]')).toBeNull();
    expect(root(fixture).querySelector('fold-card')?.classList.contains('dormant')).toBe(false);
  });
});
