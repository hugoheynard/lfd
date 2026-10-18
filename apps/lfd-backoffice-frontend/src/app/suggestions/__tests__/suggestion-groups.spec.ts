import { describe, expect, it } from 'vitest';

import { staffSuggestion } from '../staff-suggestion.testing';
import { groupsOf } from '../suggestion-groups';

/** Le jour est passé à `groupsOf` : aucune horloge n'est lue. */
const TODAY = '2026-10-18';

describe('la liste regroupée (RS9)', () => {
  it('range chaque règle sous son état, dans l’ordre de lecture, sans groupe vide', () => {
    const groups = groupsOf(
      [
        staffSuggestion({ id: 'LIVE' }),
        staffSuggestion({ id: 'SOON', startsOn: '2026-11-01', endsOn: '2026-11-05' }),
        staffSuggestion({ id: 'DONE', startsOn: '2026-10-01', endsOn: '2026-10-05' }),
        staffSuggestion({ id: 'CUT', active: false }),
        staffSuggestion({ id: 'OLD', archivedAt: '2026-10-01T08:00:00.000Z' }),
        staffSuggestion({ id: 'LIVE2' }),
      ],
      TODAY,
    );
    expect(groups.map((group) => [group.title, group.rules.map((rule) => rule.id)])).toEqual([
      ['À venir', ['SOON']],
      ['En cours', ['LIVE', 'LIVE2']],
      ['Finies', ['DONE']],
      ['Coupées', ['CUT']],
      ['Archivées', ['OLD']],
    ]);
    expect(groups.filter((group) => group.collapsed).map((group) => group.state)).toEqual([
      'cut',
      'archived',
    ]);
  });

  it('sans règle, aucun groupe', () => {
    expect(groupsOf([staffSuggestion({ id: 'LIVE' })], TODAY).map((g) => g.state)).toEqual([
      'live',
    ]);
    expect(groupsOf([], TODAY)).toEqual([]);
  });
});
