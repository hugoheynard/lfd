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
 * Hugo, 2026-10-21 (`plan-une-seule-heure.md` §5) : l'heure limite générale
 * déclenche l'arrêt du plan et vaut pour tout le monde ; l'écran le dit. Elle
 * ne dort plus — l'interrupteur est retiré.
 */
describe('CutoffsSection — ce que l’heure limite déclenche', () => {
  it('se titre par sa conséquence, et dit le plan figé', async () => {
    const fixture = await mount(['lfc_order_settings:write'], GENERAL);
    const text = root(fixture).textContent ?? '';

    expect(text).toContain('Heure limite générale — arrêt du plan de production pour le lendemain');
    expect(text).toContain('tout le monde');
    expect(text).toContain('liste à coliser, tournées, paiements en suspens annulés');
    expect(text).not.toContain('Clientèle professionnelle');
  });

  it('ne grise plus rien : l’interrupteur est retiré', async () => {
    const fixture = await mount(['lfc_order_settings:write'], GENERAL);

    expect(root(fixture).querySelector('[data-cutoff-dormant]')).toBeNull();
    expect(root(fixture).querySelector('fold-card')?.classList.contains('dormant')).toBe(false);
  });
});
