import { TestBed } from '@angular/core/testing';
import type { ComputedSuggestionResultRow } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { SuggestionComputedResults } from './suggestion-computed-results';

const row = (over: Partial<ComputedSuggestionResultRow>): ComputedSuggestionResultRow => ({
  kind: 'bought_with',
  shown: 8,
  clicked: 3,
  added: 2,
  orderedEstimate: 1,
  addRateBasisPoints: 2500,
  revenueEstimateCents: 120,
  ...over,
});

describe('SuggestionComputedResults', () => {
  it('rend une ligne « Calculé » par genre, avec ses six chiffres', async () => {
    TestBed.configureTestingModule({ imports: [SuggestionComputedResults] });
    const fixture = TestBed.createComponent(SuggestionComputedResults);
    fixture.componentRef.setInput('rows', [
      row({}),
      row({ kind: 'usuals', addRateBasisPoints: null }),
    ]);
    fixture.detectChanges();
    await fixture.whenStable();
    const items = [...(fixture.nativeElement as HTMLElement).querySelectorAll('li')].map((one) =>
      (one.textContent ?? '').replace(/\s+/gu, ' '),
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toContain('Calculé : souvent pris avec');
    expect(items[0]).toContain('25 %');
    expect(items[0]).toContain('Commandées (estimé)1');
    expect(items[0]).toContain('1,20');
    expect(items[1]).toContain('Calculé : vos habituels');
    expect(items[1]).toContain('—');
  });
});
