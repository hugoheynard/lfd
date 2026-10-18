import { TestBed } from '@angular/core/testing';
import type { StaffSuggestionPlacement } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { type ConditionsDraft, EMPTY_CONDITIONS } from '../suggestion-conditions';
import { SuggestionConditionsFieldset } from './suggestion-conditions-fieldset';

const CHOICES = {
  articles: [],
  families: [{ id: 'fam-boissons', name: 'Boissons' }],
  sites: [{ id: 'site-centre', label: 'Centre' }],
};

async function render(placement: StaffSuggestionPlacement) {
  await TestBed.configureTestingModule({
    imports: [SuggestionConditionsFieldset],
  }).compileComponents();
  const fixture = TestBed.createComponent(SuggestionConditionsFieldset);
  fixture.componentRef.setInput('conditions', EMPTY_CONDITIONS);
  fixture.componentRef.setInput('placement', placement);
  fixture.componentRef.setInput('choices', CHOICES);
  const emitted: ConditionsDraft[] = [];
  fixture.componentInstance.conditionsChange.subscribe((value) => emitted.push(value));
  fixture.detectChanges();
  await fixture.whenStable();
  return { root: fixture.nativeElement as HTMLElement, emitted };
}

function labels(root: HTMLElement): (string | null)[] {
  return [...root.querySelectorAll('fold-multiselect, fold-time, fold-input, fold-listbox')].map(
    (one) => one.getAttribute('label'),
  );
}

describe('SuggestionConditionsFieldset', () => {
  it('un encadré « Conditions (facultatives) », expliqué par des exemples', async () => {
    const { root } = await render('cart');
    const fieldset = root.querySelector('fold-fieldset');
    expect(fieldset?.getAttribute('legend')).toBe('Conditions (facultatives)');
    expect(fieldset?.getAttribute('appearance')).toBe('border');
    expect(root.textContent).toContain('Exemples');
  });

  it('au panier, le montant et la famille ; ailleurs, ils sont annoncés absents', async () => {
    const cart = await render('cart');
    expect(labels(cart.root)).toEqual([
      'Jours de la semaine',
      'À partir de',
      'Jusqu’à',
      'Montant minimum du panier (€)',
      'Seulement si le panier n’a aucun article de la famille',
      'Points de retrait',
    ]);
    TestBed.resetTestingModule();
    const home = await render('home');
    expect(labels(home.root)).toEqual([
      'Jours de la semaine',
      'À partir de',
      'Jusqu’à',
      'Points de retrait',
    ]);
    expect(home.root.textContent).toContain('ne se jugent qu’au panier');
  });
});
