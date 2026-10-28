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
  trancheMode: 'computed',
  fixedTranches: [],
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
  trancheMode: 'computed',
  fixedTranches: [],
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

const FIXED: ProductionDueThresholdsView = {
  date: '2026-10-05',
  deliveryMarginMinutes: 90,
  pickupMarginMinutes: 30,
  trancheMode: 'fixed',
  fixedTranches: ['05:00', '07:00', '12:00'],
  lines: [
    {
      sku: 'CRO',
      productName: 'Croissant',
      total: 2000,
      thresholds: [
        {
          kind: 'before_first',
          before: '05:00',
          quantity: 120,
          cumulative: 400,
          earliest: '04:30',
        },
        { kind: 'deadline', before: '07:00', quantity: 800, cumulative: 1200 },
        { kind: 'deadline', before: '12:00', quantity: 800, cumulative: 2000 },
      ],
    },
  ],
};

describe('dueThresholdRows — tranches fixes', () => {
  it('lit les seuils tels que servis et signale l’avant-première-tranche', () => {
    expect(dueThresholdRows(FIXED)[0]).toMatchObject({
      countdown: '400 avant 05:00 · 1200 avant 07:00 · 2000 avant 12:00',
      beforeFirst: '120 attendus à 04:30, avant la première tranche',
    });
    expect(dueThresholdRows(SET)[0]?.beforeFirst).toBeNull();
  });
});

describe('DueThresholdsSection', () => {
  it('dit le mode dans le titre et signale l’avant-première-tranche', async () => {
    const fixture = await mount(FIXED);

    expect(text(fixture)).toContain('Tranches fixes');
    expect(fixture.nativeElement.querySelector('[data-before-first]')?.textContent ?? '').toContain(
      '120 attendus à 04:30, avant la première tranche',
    );
  });

  it('dit les tranches calculées dans le titre', async () => {
    const fixture = await mount(SET);

    expect(text(fixture)).toContain('Tranches calculées');
  });

  it('dit la journée entière en tranches fixes sans heure', async () => {
    const fixture = await mount({ ...UNSET, trancheMode: 'fixed', fixedTranches: [] });

    expect(text(fixture)).toContain('une seule tranche, la journée');
  });

  it('montre les seuils, signale le sans-échéance, et pas de bandeau quand les marges sont réglées', async () => {
    const fixture = await mount(SET);

    expect(text(fixture)).toContain('120 avant 04:40 · 180 avant 08:10');
    expect(text(fixture)).toContain('25 sans échéance');
    expect(text(fixture)).toContain('livraison 90 min · retrait 30 min');
    expect(fixture.nativeElement.querySelector('fold-callout')).toBeNull();
  });

  /**
   * Régression : un bandeau « Régler les marges » s'ouvrait dans le dossier du
   * jour, alors que les marges sont facultatives aux Réglages (2026-10-21).
   */
  it('dit la seule échéance sous le titre, sans bandeau, quand une marge manque', async () => {
    const fixture = await mount(UNSET);

    expect(fixture.nativeElement.querySelector('fold-callout')).toBeNull();
    expect(text(fixture)).toContain('Marges non réglées, comptées à zéro');
  });

  it('dit l’échec de lecture', async () => {
    const fixture = await mount(new Error('panne'));

    expect(text(fixture)).toContain('Impossible de lire les échéances');
  });
});
