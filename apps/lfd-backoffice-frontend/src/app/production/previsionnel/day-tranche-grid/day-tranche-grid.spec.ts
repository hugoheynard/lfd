import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  ProductionDueThresholdsView,
  ProductionWorksheetView,
  WorkshopLine,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { ProductionService } from '../../production.service';
import { WorksheetService } from '../../worksheet.service';
import { DayTrancheGrid } from './day-tranche-grid';

/** La journée en grille : rendu, jour à venir sans « sorti », vide, erreur. */

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
): Promise<ComponentFixture<DayTrancheGrid>> {
  TestBed.configureTestingModule({
    imports: [DayTrancheGrid],
    providers: [
      {
        provide: ProductionService,
        useValue: {
          dueThresholds: () => (due instanceof Error ? Promise.reject(due) : Promise.resolve(due)),
        },
      },
      { provide: WorksheetService, useValue: { worksheet: () => Promise.resolve(SHEET) } },
    ],
  });
  const fixture = TestBed.createComponent(DayTrancheGrid);
  fixture.componentRef.setInput('date', '2099-01-01');
  fixture.detectChanges();
  await fixture.whenStable();
  // Deux lectures en parallèle : on laisse leurs promesses se régler.
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
  return fixture;
}

describe('la grille de la journée', () => {
  it('rend une colonne par tranche, une ligne par produit, et la charge', async () => {
    const el: HTMLElement = (await mount(DUE)).nativeElement;

    expect([...el.querySelectorAll('thead th')].map((th) => th.textContent?.trim())).toEqual([
      'Produit',
      'avant 07:00',
      'avant 09:30',
      'Total',
    ]);
    expect(el.querySelectorAll('[data-grid-row]').length).toBe(1);
    expect(el.textContent).toContain('Viennoiserie');
    expect(el.querySelector('[data-load-pieces]')?.textContent).toContain('240');
  });

  it('un jour à venir ne montre pas de « sorti »', async () => {
    const el: HTMLElement = (await mount(DUE)).nativeElement;

    expect(el.textContent).not.toContain(' / ');
    expect(el.querySelectorAll('[data-state]').length).toBe(0);
  });

  it('dit quand la journée est vide', async () => {
    const el: HTMLElement = (await mount({ ...DUE, lines: [] })).nativeElement;

    expect(el.textContent).toContain('Rien à sortir ce jour-là');
  });

  it("dit l'échec, et propose de réessayer", async () => {
    const el: HTMLElement = (await mount(new Error('boom'))).nativeElement;

    expect(el.textContent).toContain('Impossible de lire la grille');
    expect(el.querySelector('button')?.textContent).toContain('Réessayer');
  });
});
