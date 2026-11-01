import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  ProductionDueThresholdsView,
  ProductionForecastView,
  ProductionWorksheetView,
  WorkshopLine,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { ProductionService } from '../../production.service';
import { WorksheetService } from '../../worksheet.service';
import { DayTrancheWall } from './day-tranche-wall';

/** La journée par tranche, dans la table du prévisionnel : rendu, jour à venir sans « sorti », jour même avec, vide, erreur. */

const DUE: ProductionDueThresholdsView = {
  date: '2099-01-01',
  deliveryMarginMinutes: 60,
  pickupMarginMinutes: 30,
  trancheMode: 'computed',
  fixedTranches: [],
  lines: [
    {
      sku: 'CRO',
      productName: 'Croissant',
      total: 240,
      thresholds: [
        { kind: 'deadline', before: '07:00', quantity: 120, cumulative: 120 },
        { kind: 'deadline', before: '09:30', quantity: 120, cumulative: 240 },
      ],
    },
  ],
};

/** Le prévisionnel de la journée : le croissant à heure, et une tarte sans aucune échéance. */
function forecastOf(date: string): ProductionForecastView {
  return {
    days: [
      {
        date,
        totalUnits: 248,
        orderCount: 3,
        resupplyUnits: 0,
        closed: false,
        state: 'open',
        closesAt: null,
      },
    ],
    peakDate: null,
    totalUnits: 248,
    lines: [
      {
        sku: 'CRO',
        productName: 'Croissant',
        saleUnit: 'piece',
        quantities: [240],
        resupplyQuantities: [0],
        totalUnits: 240,
      },
      {
        sku: 'TAR',
        productName: 'Tarte',
        saleUnit: 'piece',
        quantities: [8],
        resupplyQuantities: [0],
        totalUnits: 8,
      },
    ],
  };
}

const CRO: WorkshopLine = {
  sku: 'CRO',
  productName: 'Croissant',
  quantity: 240,
  saleUnit: 'piece',
  containerLabel: null,
  done: false,
  initials: null,
  doneAt: null,
  produced: 0,
  remaining: 240,
  surplus: 0,
  batches: [],
  container: null,
  deadlines: [
    { quantity: 120, before: '07:00' },
    { quantity: 120, before: '09:30' },
  ],
};

const SHEET: ProductionWorksheetView = {
  date: '2099-01-01',
  generatedAt: null,
  retakenAt: null,
  lines: [],
  drift: null,
  groups: [
    {
      key: 'VIENN',
      family: null,
      category: null,
      label: 'Viennoiserie',
      lineCount: 1,
      doneCount: 0,
      totalUnits: 240,
      remainingUnits: 240,
      doneUnits: 0,
      lines: [CRO],
      pending: [CRO],
      done: [],
    },
  ],
  shelvesKnown: true,
  relativeDay: null,
};

async function mount(
  due: ProductionDueThresholdsView | Error,
  date = '2099-01-01',
  empty = false,
): Promise<ComponentFixture<DayTrancheWall>> {
  TestBed.configureTestingModule({
    imports: [DayTrancheWall],
    providers: [
      {
        provide: ProductionService,
        useValue: {
          forecast: () =>
            due instanceof Error
              ? Promise.reject(due)
              : Promise.resolve(empty ? { ...forecastOf(date), lines: [] } : forecastOf(date)),
          dueThresholds: () => (due instanceof Error ? Promise.reject(due) : Promise.resolve(due)),
        },
      },
      {
        provide: WorksheetService,
        useValue: { worksheet: () => Promise.resolve({ ...SHEET, date }) },
      },
    ],
  });
  const fixture = TestBed.createComponent(DayTrancheWall);
  fixture.componentRef.setInput('date', date);
  fixture.componentRef.setInput('catalogue', []);
  fixture.detectChanges();
  await fixture.whenStable();
  // Deux lectures en parallèle : on laisse leurs promesses se régler.
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
  return fixture;
}

function texts(el: HTMLElement, selector: string): (string | undefined)[] {
  return [...el.querySelectorAll(selector)].map((node) => node.textContent?.trim());
}

describe('la journée par tranche', () => {
  it('rend la table du prévisionnel, une colonne par tranche, et la charge au pied', async () => {
    const el: HTMLElement = (await mount(DUE)).nativeElement;

    expect(el.querySelector('app-forecast-table')).not.toBeNull();
    expect(texts(el, '.pv-day-date')).toEqual(['avant 07:00', 'avant 09:30', 'Sans heure']);
    // La tarte n'a aucune échéance : elle est là quand même, « Sans heure ».
    expect(el.querySelectorAll('.pv-row--line')).toHaveLength(2);
    expect(texts(el, '[data-foot="pieces"]')).toEqual(['120', '120', '8']);
  });

  it('un jour à venir ne montre que des quantités : ni « sorti », ni état', async () => {
    const el: HTMLElement = (await mount(DUE)).nativeElement;

    expect(texts(el, '.pv-qty-value')).toEqual(['120', '120', '8']);
    expect(el.querySelectorAll('.pv-progress')).toHaveLength(0);
    expect(el.querySelectorAll('.pv-day-state')).toHaveLength(0);
  });

  it('un jour passé dit « sorti / à sortir » et l’état, en mot', async () => {
    const el: HTMLElement = (await mount({ ...DUE, date: '2000-01-01' }, '2000-01-01'))
      .nativeElement;

    expect(texts(el, '.pv-qty-value')).toEqual(['0 / 120', '0 / 120', '8']);
    expect(texts(el, '.pv-progress')).toEqual(['Dépassée', 'Dépassée']);
    // L'état des colonnes ne se dit que le jour même.
    expect(el.querySelectorAll('.pv-day-state')).toHaveLength(0);
  });

  it('dit quand la journée est vide', async () => {
    const el: HTMLElement = (await mount(DUE, '2099-01-01', true)).nativeElement;

    expect(el.textContent).toContain('Rien à sortir ce jour-là');
  });

  it("dit l'échec, et propose de réessayer", async () => {
    const el: HTMLElement = (await mount(new Error('boom'))).nativeElement;

    expect(el.textContent).toContain('Journée illisible');
    expect(el.querySelector('button')?.textContent).toContain('Réessayer');
  });
});
