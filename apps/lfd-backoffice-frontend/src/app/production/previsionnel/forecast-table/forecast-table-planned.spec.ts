import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { ProductionForecastView } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { ForecastTable } from './forecast-table';
import { shelfGrouping } from '../../__tests__/shelf-grouping-fixture';
import { forecastRayons, totalOfRayons } from '../previsionnel-matrix';
import { DAY_FOOT_ROWS, dayColumns, forecastHeaders } from '../previsionnel-range';

/**
 * La couche « planifié, non commandé » (`le-previsionnel.md`) : l'écran
 * montre ce que le serveur chiffre, à part, et ne l'additionne à rien.
 */

const VIEW: ProductionForecastView = {
  days: [
    {
      date: '2026-09-03',
      totalUnits: 100,
      orderCount: 4,
      resupplyUnits: 0,
      plannedUnits: 0,
      closed: true,
      state: 'closed',
      closesAt: null,
    },
    {
      date: '2026-09-04',
      totalUnits: 60,
      orderCount: 2,
      resupplyUnits: 0,
      plannedUnits: 43,
      closed: false,
      state: 'open',
      closesAt: null,
    },
  ],
  lines: [
    {
      sku: 'PLAN-SEUL',
      productName: 'Pain de mie',
      saleUnit: 'piece',
      quantities: [0, 0],
      resupplyQuantities: [0, 0],
      plannedQuantities: [0, 3],
      totalUnits: 0,
    },
    {
      sku: 'VIE-001',
      productName: 'Croissant',
      saleUnit: 'piece',
      quantities: [100, 60],
      resupplyQuantities: [0, 0],
      plannedQuantities: [0, 40],
      totalUnits: 160,
    },
    {
      sku: 'VIE-002',
      productName: 'Pain au chocolat',
      saleUnit: 'piece',
      quantities: [0, 0],
      resupplyQuantities: [0, 0],
      plannedQuantities: [0, 0],
      totalUnits: 0,
    },
  ],
  peakDate: '2026-09-03',
  totalUnits: 160,
};

function rayons() {
  return forecastRayons(
    VIEW,
    shelfGrouping(
      VIEW.lines.map((line) => line.sku),
      null,
    ),
  );
}

function mount() {
  const fixture = TestBed.createComponent(ForecastTable);
  fixture.componentRef.setInput(
    'columns',
    dayColumns(forecastHeaders(VIEW.days, VIEW.peakDate, '2026-09-03')),
  );
  fixture.componentRef.setInput('footRows', DAY_FOOT_ROWS);
  fixture.componentRef.setInput('rayons', rayons());
  fixture.detectChanges();
  return fixture;
}

describe('ForecastTable — planifié, non commandé', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('n’ajoute rien au total : seules les quantités commandées comptent', () => {
    expect(totalOfRayons(rayons())).toBe(160);
  });

  it('pose « dont planifié » sous chaque produit qui en a, et sous lui seul', () => {
    const element: HTMLElement = mount().nativeElement;
    const rows = [...element.querySelectorAll('[data-forecast-planned]')].map((row) =>
      [...row.querySelectorAll('.pv-cell')].map((cell) => cell.textContent?.trim()),
    );

    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual(['dont planifié', '', '+40']);
    expect(rows).toContainEqual(['dont planifié', '', '+3']);
  });

  it('dit au pied « Planifié, non commandé » par jour, vide pour zéro', () => {
    const element: HTMLElement = mount().nativeElement;
    const foot = [...element.querySelectorAll('[data-foot="planned"]')].map((cell) =>
      cell.textContent?.trim(),
    );

    expect(foot).toEqual(['', '+43']);
    expect(element.querySelector('.pv-row--planned-foot')?.textContent).toContain(
      'Planifié, non commandé',
    );
  });

  it('ne pose aucune ligne planifiée quand le serveur n’en sert pas', () => {
    const fixture = TestBed.createComponent(ForecastTable);
    const bare: ProductionForecastView = {
      ...VIEW,
      lines: VIEW.lines.map(({ plannedQuantities: _planned, ...line }) => line),
    };
    fixture.componentRef.setInput('columns', []);
    fixture.componentRef.setInput('footRows', DAY_FOOT_ROWS);
    fixture.componentRef.setInput(
      'rayons',
      forecastRayons(
        bare,
        shelfGrouping(
          bare.lines.map((line) => line.sku),
          null,
        ),
      ),
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('[data-forecast-planned]')).toHaveLength(0);
  });
});
