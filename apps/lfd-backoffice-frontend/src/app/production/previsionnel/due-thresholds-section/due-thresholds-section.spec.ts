import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ProductionDueThresholdsView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { ProductionService } from '../../production.service';
import { DueThresholdsSection, dueThresholdRows } from './due-thresholds-section';

/** Le compte à rebours d'une journée (plan « production par vagues », V0). */

const SET: ProductionDueThresholdsView = {
  date: '2026-10-05',
  deliveryMarginMinutes: 90,
  pickupMarginMinutes: 30,
  lines: [
    {
      sku: 'PAIN-2',
      productName: 'Pain de campagne',
      total: 205,
      thresholds: [
        { kind: 'deadline', before: '04:40', quantity: 120, cumulative: 120 },
        { kind: 'deadline', before: '08:10', quantity: 60, cumulative: 180 },
        { kind: 'undated', before: null, quantity: 25, cumulative: 205 },
      ],
    },
    {
      sku: 'BAG-1',
      productName: 'Baguette',
      total: 40,
      thresholds: [{ kind: 'deadline', before: '06:00', quantity: 40, cumulative: 40 }],
    },
  ],
};

const UNSET: ProductionDueThresholdsView = {
  date: '2026-10-05',
  deliveryMarginMinutes: null,
  pickupMarginMinutes: 30,
  lines: [
    {
      sku: 'BAG-1',
      productName: 'Baguette',
      total: 40,
      thresholds: [{ kind: 'day', before: null, quantity: 40, cumulative: 40 }],
    },
  ],
};

async function mount(
  view: ProductionDueThresholdsView | Error,
): Promise<ComponentFixture<DueThresholdsSection>> {
  TestBed.configureTestingModule({
    imports: [DueThresholdsSection],
    providers: [
      provideRouter([]),
      {
        provide: ProductionService,
        useValue: {
          dueThresholds: () =>
            view instanceof Error ? Promise.reject(view) : Promise.resolve(view),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(DueThresholdsSection);
  fixture.componentRef.setInput('date', '2026-10-05');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<DueThresholdsSection>): string =>
  fixture.nativeElement.textContent ?? '';

describe('dueThresholdRows', () => {
  it('cumule les seuils datés, met à part le sans-échéance, et trie par nom', () => {
    const rows = dueThresholdRows(SET);

    expect(rows.map((row) => row.productName)).toEqual(['Baguette', 'Pain de campagne']);
    expect(rows[1]).toMatchObject({ countdown: '120 avant 04:40 · 180 avant 08:10', undated: 25 });
    expect(rows[0]?.undated).toBe(0);
  });

  it('dit « la journée » quand les marges manquent', () => {
    expect(dueThresholdRows(UNSET)[0]?.countdown).toBe('40 dans la journée');
  });
});

describe('DueThresholdsSection', () => {
  it('montre les seuils, signale le sans-échéance, et pas de bandeau quand les marges sont réglées', async () => {
    const fixture = await mount(SET);

    expect(text(fixture)).toContain('120 avant 04:40 · 180 avant 08:10');
    expect(text(fixture)).toContain('25 sans échéance');
    expect(text(fixture)).toContain('livraison 90 min · retrait 30 min');
    expect(fixture.nativeElement.querySelector('fold-callout')).toBeNull();
  });

  it('pose un bandeau vers le réglage quand une marge manque', async () => {
    const fixture = await mount(UNSET);

    const link: HTMLAnchorElement | null = fixture.nativeElement.querySelector('fold-callout a');
    expect(link?.getAttribute('href')).toBe('/b2b/reglages/livraison');
  });

  it('dit l’échec de lecture', async () => {
    const fixture = await mount(new Error('panne'));

    expect(text(fixture)).toContain('Impossible de lire les échéances');
  });
});
