import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { ProductionWorksheetView, WorkshopLine } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { WorksheetService } from '../../worksheet.service';
import { DayTranchesSection, tranchesNow } from './day-tranches-section';

/** La vue par tranche dans le Prod manager : la fiche, sans ses gestes. */

const LINE: WorkshopLine = {
  sku: 'CRO',
  productName: 'Croissant au beurre',
  quantity: 240,
  saleUnit: 'piece',
  containerLabel: null,
  done: false,
  initials: null,
  doneAt: null,
  produced: 130,
  remaining: 110,
  surplus: 0,
  batches: [],
  container: { unitsPerContainer: 30, singular: 'plaque' },
  deadlines: [
    { quantity: 120, before: '07:00' },
    { quantity: 120, before: '09:30' },
  ],
};

function viewWith(lines: readonly WorkshopLine[]): ProductionWorksheetView {
  const groups: ProductionWorksheetView['groups'] =
    lines.length === 0
      ? []
      : [
          {
            key: 'VIENN',
            family: null,
            category: null,
            label: 'Viennoiserie',
            lineCount: lines.length,
            doneCount: 0,
            totalUnits: 240,
            remainingUnits: 110,
            doneUnits: 130,
            lines,
            pending: lines,
            done: [],
          },
        ];
  return {
    date: '2099-01-01',
    generatedAt: null,
    retakenAt: null,
    lines,
    drift: null,
    groups,
    shelvesKnown: true,
    relativeDay: null,
  };
}

async function mount(
  answer: ProductionWorksheetView | Error,
): Promise<ComponentFixture<DayTranchesSection>> {
  TestBed.configureTestingModule({
    imports: [DayTranchesSection],
    providers: [
      {
        provide: WorksheetService,
        useValue: {
          worksheet: () =>
            answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(DayTranchesSection);
  fixture.componentRef.setInput('date', '2099-01-01');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('tranchesNow', () => {
  it("aujourd'hui : les minutes de la fiche", () => {
    expect(tranchesNow('2026-11-01', '2026-11-01', 476)).toBe(476);
  });
  it('un jour à venir : tout reste à venir', () => {
    expect(tranchesNow('2026-11-02', '2026-11-01', 476)).toBe(0);
  });
  it('un jour passé : la journée entière', () => {
    expect(tranchesNow('2026-10-31', '2026-11-01', 476)).toBe(24 * 60);
  });
});

describe('la section « Par tranche »', () => {
  it('rend les cartes, sans aucun bouton', async () => {
    const el: HTMLElement = (await mount(viewWith([LINE]))).nativeElement;

    expect(el.textContent).toContain('Par tranche');
    expect(el.querySelectorAll('[data-slot-state]').length).toBe(2);
    expect(el.querySelectorAll('button').length).toBe(0);
  });

  it('dit quand la journée est vide', async () => {
    const el: HTMLElement = (await mount(viewWith([]))).nativeElement;

    expect(el.textContent).toContain('Aucune tranche ce jour-là');
  });

  it("dit l'échec, et propose de réessayer", async () => {
    const el: HTMLElement = (await mount(new Error('boom'))).nativeElement;

    expect(el.textContent).toContain('Impossible de lire les tranches');
    expect(el.querySelector('button')?.textContent).toContain('Réessayer');
  });
});
