import { TestBed } from '@angular/core/testing';
import type { ProductionWorksheetView, WorkshopLine } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PreparationSlots } from './preparation-slots';

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

function sheet(lines: readonly WorkshopLine[]): ProductionWorksheetView {
  return {
    // Une journée passée : toutes les tranches sont franchies, quel que soit le jour du test.
    date: '2000-01-03',
    generatedAt: 'x',
    retakenAt: null,
    lines: [],
    drift: null,
    shelvesKnown: true,
    relativeDay: null,
    groups: [
      {
        key: 'v',
        family: { id: 'v', name: 'Viennoiseries', position: 1 },
        category: null,
        label: 'Viennoiseries',
        lineCount: lines.length,
        doneCount: 0,
        totalUnits: 240,
        remainingUnits: 110,
        doneUnits: 130,
        lines,
        done: [],
        pending: lines,
      },
    ],
  };
}

function render(lines: readonly WorkshopLine[]): HTMLElement {
  const fixture = TestBed.createComponent(PreparationSlots);
  fixture.componentRef.setInput('view', sheet(lines));
  fixture.componentRef.setInput('date', '2000-01-03');
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('PreparationSlots — la colonne 1 par tranche (Hugo, 2026-11-01)', () => {
  it('rend les tranches de la fiche, en lecture seule : aucun bouton', () => {
    const element = render([LINE]);

    expect(element.querySelectorAll('[data-slot-state]').length).toBeGreaterThan(0);
    expect(element.querySelector('button')).toBeNull();
  });

  it('une fiche vide le dit', () => {
    expect(render([]).textContent).toContain('Aucune tranche ce jour');
  });
});
