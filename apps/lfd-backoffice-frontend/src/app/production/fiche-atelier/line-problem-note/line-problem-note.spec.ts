import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { WorkshopLine, WorkshopLineProblem } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { LineProblemNote } from './line-problem-note';

function line(over: Partial<WorkshopLine> = {}): WorkshopLine {
  return {
    sku: 'CRO',
    productName: 'Croissant',
    quantity: 120,
    saleUnit: 'piece',
    containerLabel: null,
    done: false,
    initials: null,
    doneAt: null,
    produced: 0,
    remaining: 120,
    surplus: 0,
    batches: [],
    container: null,
    ...over,
  };
}

/** Un signalement à 9 h 12 heure locale, quel que soit le fuseau du poste. */
function reportedAt(): string {
  const at = new Date();
  at.setHours(9, 12, 0, 0);
  return at.toISOString();
}

function problem(over: Partial<WorkshopLineProblem> = {}): WorkshopLineProblem {
  return {
    id: 'p1',
    version: 1,
    expected: 120,
    produced: 80,
    reason: 'four en panne',
    reportedAt: reportedAt(),
    ...over,
  };
}

function render(value: WorkshopLine): HTMLElement {
  const fixture: ComponentFixture<LineProblemNote> = TestBed.createComponent(LineProblemNote);
  fixture.componentRef.setInput('line', value);
  fixture.detectChanges();
  return fixture.nativeElement;
}

const text = (el: Element | null): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('la note du rouge d’une ligne', () => {
  it('ne montre rien sans problème ni plafond', () => {
    const el = render(line());

    expect(el.querySelector('[data-line-problem]')).toBeNull();
    expect(el.querySelector('[data-line-ceiling]')).toBeNull();
  });

  it('traite un champ absent ou null comme « aucun rouge »', () => {
    const el = render(line({ problem: null, ceiling: null }));

    expect(el.querySelector('fold-callout')).toBeNull();
  });

  it('dit l’heure, le sorti déclaré, l’attendu, la raison et le plafond', () => {
    const el = render(line({ problem: problem(), ceiling: 80 }));

    expect(text(el.querySelector('[data-line-problem]'))).toBe(
      'Problème signalé à 9 h 12 : 80 sorties sur 120 attendues · four en panne · Plafond du jour : 80',
    );
  });

  it('omet la raison quand elle n’est pas donnée', () => {
    const el = render(line({ problem: problem({ reason: null }) }));

    expect(text(el.querySelector('[data-line-problem]'))).toBe(
      'Problème signalé à 9 h 12 : 80 sorties sur 120 attendues',
    );
  });

  it('omet l’heure quand elle est illisible', () => {
    const el = render(line({ problem: problem({ reportedAt: 'pas une date', reason: null }) }));

    expect(text(el.querySelector('[data-line-problem]'))).toBe(
      'Problème signalé : 80 sorties sur 120 attendues',
    );
  });

  it('dit les quantités en kilos pour un article au poids', () => {
    const el = render(
      line({
        saleUnit: 'weight',
        problem: problem({ expected: 2000, produced: 1250, reason: null }),
      }),
    );

    expect(text(el.querySelector('[data-line-problem]'))).toContain(
      '1,25 kg sorties sur 2 kg attendues',
    );
  });

  it('garde le plafond seul, en neutre, quand le rouge est traité', () => {
    const el = render(line({ problem: null, ceiling: 80 }));

    expect(el.querySelector('[data-line-problem]')).toBeNull();
    expect(text(el.querySelector('[data-line-ceiling]'))).toBe('Plafond du jour : 80');
  });

  it('montre un plafond de zéro : zéro n’est pas l’absence de plafond', () => {
    const el = render(line({ ceiling: 0 }));

    expect(text(el.querySelector('[data-line-ceiling]'))).toBe('Plafond du jour : 0');
  });
});
