import {
  declaredHours,
  formatTimeRange,
  hoursIssueOf,
  isBadRange,
  isRangeSet,
  withRangePart,
  type HoursEntry,
} from '../hours.model';

const entries: readonly HoursEntry[] = [
  { key: 'pro', label: 'Créneau pro', range: { start: '05:00', end: '06:30' } },
  { key: 'public', label: 'Ouverture au public', range: { start: '', end: '' } },
];

describe('formatTimeRange', () => {
  it('écrit une plage complète', () => {
    expect(formatTimeRange({ start: '08:00', end: '10:00' })).toBe('08:00–10:00');
  });

  it('dit la borne manquante plutôt que de laisser un tiret suspendu', () => {
    expect(formatTimeRange({ start: '', end: '12:00' })).toBe("jusqu'à 12:00");
    expect(formatTimeRange({ start: '09:00', end: '' })).toBe('à partir de 09:00');
  });

  it('ne dit rien d’une plage vide', () => {
    expect(formatTimeRange({ start: '', end: '' })).toBe('');
  });
});

describe('la validité d’une plage', () => {
  it('exige les deux bornes, la fin après le début', () => {
    expect(isRangeSet({ start: '08:00', end: '10:00' })).toBe(true);
    expect(isRangeSet({ start: '10:00', end: '08:00' })).toBe(false);
  });

  it('ne reproche rien à une plage jamais touchée', () => {
    expect(isBadRange({ start: '', end: '' })).toBe(false);
  });

  it('reproche une plage entamée mais fausse', () => {
    expect(isBadRange({ start: '08:00', end: '' })).toBe(true);
    expect(isBadRange({ start: '10:00', end: '08:00' })).toBe(true);
  });

  it('hoursIssueOf se tait tant qu’aucune ligne n’est fausse', () => {
    expect(hoursIssueOf(entries)).toBe('');
    expect(hoursIssueOf(withRangePart(entries, 'public', 'end', '20:00'))).not.toBe('');
  });
});

describe('declaredHours', () => {
  it('ne garde que les plages qui disent quelque chose', () => {
    expect(declaredHours(entries).map((entry) => entry.key)).toEqual(['pro']);
  });
});

describe('withRangePart', () => {
  it('écrit une borne sans toucher aux autres lignes', () => {
    const next = withRangePart(entries, 'public', 'start', '07:00');

    expect(next[1]?.range).toEqual({ start: '07:00', end: '' });
    expect(next[0]).toBe(entries[0]);
  });

  it('ignore une clé inconnue plutôt que d’inventer une ligne', () => {
    expect(withRangePart(entries, 'nope', 'start', '07:00')).toEqual(entries);
  });
});
