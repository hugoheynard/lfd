import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { staffSuggestion } from '../staff-suggestion.testing';
import type { SuggestionGesture } from '../suggestion-gesture';
import { SuggestionRuleRow } from './suggestion-rule-row';

async function render(canWrite: boolean, archived: boolean) {
  TestBed.configureTestingModule({ imports: [SuggestionRuleRow] });
  const fixture = TestBed.createComponent(SuggestionRuleRow);
  fixture.componentRef.setInput(
    'rule',
    staffSuggestion(archived ? { archivedAt: '2026-10-01T08:00:00.000Z' } : {}),
  );
  fixture.componentRef.setInput('canWrite', canWrite);
  const gestures: SuggestionGesture[] = [];
  fixture.componentInstance.gesture.subscribe((gesture) => gestures.push(gesture));
  fixture.detectChanges();
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const labels = [...root.querySelectorAll('button')].map((one) => one.textContent?.trim());
  return { root, gestures, labels };
}

describe('SuggestionRuleRow', () => {
  it('sans droit d’écrire, seul l’aperçu', async () => {
    const { labels } = await render(false, false);
    expect(labels).toEqual(['Ouvrir l’aperçu']);
  });

  it('avec le droit, « Dupliquer » remonte la règle', async () => {
    const { root, gestures, labels } = await render(true, false);
    expect(labels).toContain('Dupliquer');
    [...root.querySelectorAll('button')]
      .find((one) => one.textContent?.trim() === 'Dupliquer')
      ?.click();
    expect(gestures.map((gesture) => gesture.kind)).toEqual(['duplicate']);
  });

  it('une archivée ne se modifie plus, mais se duplique', async () => {
    const { labels } = await render(true, true);
    expect(labels).toEqual(['Dupliquer']);
  });
});
