import { TestBed } from '@angular/core/testing';
import type { ProductionTrackingLevel, WorkshopLine } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { WorksheetSlots } from '../worksheet-slots/worksheet-slots';
import { WorkshopKeypadOpener } from '../openers/workshop-keypad-opener';
import { WorkshopLineView } from './workshop-line';

/**
 * **Les deux vues de la fiche offrent les mêmes gestes, à chaque niveau.**
 *
 * Régression : la vue par tranche ignorait le niveau de suivi et offrait
 * « + 1 plaque » et « Saisir » à une ligne toujours vert, vu en production.
 */

const NOW = 6 * 60;

function line(level: ProductionTrackingLevel): WorkshopLine {
  return {
    sku: 'CRO',
    productName: 'Croissant au beurre',
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
    container: { unitsPerContainer: 30, singular: 'plaque' },
    deadlines: [{ quantity: 240, before: '07:00' }],
    trackingLevel: level,
  };
}

/** Les gestes d'une vue, ramenés à trois familles : compter, cocher, signaler. */
function kinds(host: HTMLElement): { count: boolean; check: boolean; report: boolean } {
  const labels = [...host.querySelectorAll('button')].map((node) => node.textContent?.trim() ?? '');
  return {
    count: labels.some((label) => label.startsWith('+ 1') || label === 'Saisir'),
    check: labels.some((label) => label.startsWith('Fait')),
    report: labels.includes('Problème'),
  };
}

function productView(level: ProductionTrackingLevel): HTMLElement {
  const fixture = TestBed.createComponent(WorkshopLineView);
  fixture.componentRef.setInput('line', line(level));
  fixture.componentRef.setInput('now', NOW);
  fixture.detectChanges();
  return fixture.nativeElement;
}

function slotView(level: ProductionTrackingLevel): HTMLElement {
  const fixture = TestBed.createComponent(WorksheetSlots);
  fixture.componentRef.setInput('lines', [line(level)]);
  fixture.componentRef.setInput('now', NOW);
  fixture.detectChanges();
  return fixture.nativeElement;
}

beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [{ provide: WorkshopKeypadOpener, useValue: { openFor: async () => null } }],
  });
});

describe('les deux vues de la fiche, niveau par niveau', () => {
  const LEVELS: readonly ProductionTrackingLevel[] = ['always_green', 'simple', 'detailed'];

  for (const level of LEVELS) {
    it(`${level} : la vue par tranche offre les gestes de la vue produit`, () => {
      expect(kinds(slotView(level))).toEqual(kinds(productView(level)));
    });
  }

  it('la vue produit choisit le composant du niveau', () => {
    expect(productView('always_green').querySelector('app-line-always-green')).not.toBeNull();
    expect(productView('simple').querySelector('app-line-simple')).not.toBeNull();
    expect(productView('detailed').querySelector('app-worksheet-line')).not.toBeNull();
  });
});
