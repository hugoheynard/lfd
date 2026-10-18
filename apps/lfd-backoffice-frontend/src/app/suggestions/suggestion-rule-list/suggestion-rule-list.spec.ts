import { TestBed } from '@angular/core/testing';
import {
  addDays,
  type StaffSuggestionRuleAlert,
  type StaffSuggestionRuleView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { parisToday } from '../../shared/paris-today';
import { staffSuggestion } from '../staff-suggestion.testing';
import type { SuggestionGesture } from '../suggestion-gesture';
import { SuggestionRuleList } from './suggestion-rule-list';

/** Les états se lisent contre aujourd'hui : les jours sont relatifs. */
const TODAY = parisToday();

const RULES: readonly StaffSuggestionRuleView[] = [
  staffSuggestion({ id: 'LIVE', startsOn: TODAY, endsOn: addDays(TODAY, 3) }),
  staffSuggestion({
    id: 'SANE',
    startsOn: TODAY,
    endsOn: addDays(TODAY, 3),
    phrase: { fr: 'Une règle saine' },
  }),
  staffSuggestion({ id: 'SOON', startsOn: addDays(TODAY, 5), endsOn: addDays(TODAY, 6) }),
  staffSuggestion({ id: 'DONE', startsOn: addDays(TODAY, -9), endsOn: addDays(TODAY, -2) }),
  staffSuggestion({ id: 'CUT', active: false }),
  staffSuggestion({ id: 'OLD', archivedAt: '2026-10-01T08:00:00.000Z' }),
];

const ALERT: StaffSuggestionRuleAlert = {
  ruleId: 'LIVE',
  severity: 'empty',
  triggerWithdrawn: false,
  conditions: [],
  items: [{ sku: 'PAI-001', audience: 'public', reason: 'hidden_for_audience' }],
  window: { from: TODAY, to: addDays(TODAY, 3), capped: false },
};

async function render(alerts: ReadonlyMap<string, StaffSuggestionRuleAlert> | null = null) {
  TestBed.configureTestingModule({ imports: [SuggestionRuleList] });
  const fixture = TestBed.createComponent(SuggestionRuleList);
  fixture.componentRef.setInput('rules', RULES);
  fixture.componentRef.setInput('alerts', alerts);
  fixture.componentRef.setInput('canWrite', true);
  const gestures: SuggestionGesture[] = [];
  fixture.componentInstance.gesture.subscribe((gesture) => gestures.push(gesture));
  fixture.detectChanges();
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, root, gestures };
}

function groupIds(root: HTMLElement): Record<string, number> {
  return Object.fromEntries(
    [...root.querySelectorAll<HTMLElement>('fold-card[data-group]')].map((card) => [
      card.dataset['group'] ?? '',
      card.querySelectorAll('li[app-suggestion-rule-row]').length,
    ]),
  );
}

describe('SuggestionRuleList', () => {
  it('regroupe « À venir / En cours / Finies », puis Coupées et Archivées repliées, avec un compte', async () => {
    const { root } = await render();
    expect(groupIds(root)).toEqual({ scheduled: 1, live: 2, ended: 1, cut: 1, archived: 1 });
    const text = (root.textContent ?? '').replace(/\s+/gu, ' ');
    expect(text).toContain('À venir (1)');
    expect(text).toContain('En cours (2)');
    expect(text).toContain('Finies (1)');
    expect(text).toContain('Coupées (1)');
    expect(text).toContain('Archivées (1)');
    const collapsed = [...root.querySelectorAll<HTMLElement>('fold-card[data-group]')]
      .filter((card) => card.querySelector('fold-disclosure') !== null)
      .map((card) => card.dataset['group']);
    expect(collapsed).toEqual(['cut', 'archived']);
  });

  it('« À corriger » ne garde que les règles signalées, et les archivées à part', async () => {
    const { root, fixture } = await render(new Map([['LIVE', ALERT]]));
    const toFix = [...root.querySelectorAll<HTMLElement>('[role="radio"]')].find((segment) =>
      segment.textContent?.includes('À corriger (1)'),
    );
    expect(toFix).toBeDefined();
    toFix?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(groupIds(root)).toEqual({ live: 1, archived: 1 });
    expect(root.textContent).not.toContain('Une règle saine');
  });

  it('sans alertes lues, pas de filtre', async () => {
    const { root } = await render(null);
    expect(root.querySelector('fold-view-toggle')).toBeNull();
  });

  it('« Dupliquer » remonte le geste avec sa règle, archivée comprise', async () => {
    const { root, gestures } = await render();
    const archived = root.querySelector<HTMLElement>('fold-card[data-group="archived"]');
    const duplicate = [...(archived?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent?.trim() === 'Dupliquer',
    );
    duplicate?.click();
    expect(gestures.map((gesture) => [gesture.kind, gesture.rule.id])).toEqual([
      ['duplicate', 'OLD'],
    ]);
  });
});
