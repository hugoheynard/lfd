import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { AllergenEntry } from '../../../data/models';
import { RegulatoryPanel } from './regulatory-panel';

const ENTRY: AllergenEntry = {
  code: 'TBD_BARLEY',
  label: 'Orge',
  incoCategory: 'gluten',
  incoLabel: 'Céréales (gluten)',
  provisional: true,
};

function mount() {
  const fixture = TestBed.createComponent(RegulatoryPanel);
  const ref = fixture.componentRef;
  ref.setInput('declaresNone', false);
  ref.setInput('selected', []);
  ref.setInput('nutrition', {
    energyKcal: null,
    carbsG: null,
    fatG: null,
    proteinG: null,
    glycemicIndex: null,
  });
  ref.setInput('scope', 'eu');
  ref.setInput('groups', [{ incoLabel: ENTRY.incoLabel, entries: [ENTRY] }]);
  fixture.detectChanges();
  return fixture;
}

describe('RegulatoryPanel', () => {
  it('rend les groupes d’allergènes et les valeurs nutritionnelles', () => {
    const text = (mount().nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Orge');
    expect(text).toContain('Calories (kcal)');
  });

  it('émet scopeChange au clic sur un scope', () => {
    const fixture = mount();
    let scope: string | null = null;
    fixture.componentInstance.scopeChange.subscribe((s) => (scope = s));
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '.scope button',
    );
    (buttons[1] as HTMLButtonElement).click();
    expect(scope).toBe('world');
  });

  it('émet save quand saveable', () => {
    const fixture = mount();
    fixture.componentRef.setInput('saveable', true);
    fixture.detectChanges();
    let saved = false;
    fixture.componentInstance.save.subscribe(() => (saved = true));
    const footer = (fixture.nativeElement as HTMLElement).querySelector(
      '.section-footer button',
    );
    (footer as HTMLButtonElement).click();
    expect(saved).toBe(true);
  });
});
