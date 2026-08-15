import { formatTimeRange, hoursIssueOf, type HoursEntry } from '@lfd/b2b-ui/hours';

import {
  EMPTY_OPENING,
  openingEntries,
  openingRows,
  toPickupOpening,
} from '../pickup-opening.model';

const empty = openingEntries(EMPTY_OPENING);

/** Écrit une plage sur la ligne nommée, comme le ferait le formulaire. */
function withRange(key: string, start: string, end: string): readonly HoursEntry[] {
  return empty.map((entry) => (entry.key === key ? { ...entry, range: { start, end } } : entry));
}

describe('les heures de retrait', () => {
  it('ne déclare aucune fenêtre quand rien n’est saisi', () => {
    expect(hoursIssueOf(empty)).toBe('');
    expect(toPickupOpening(empty)).toEqual({ publicOpening: null, proPickup: null });
  });

  it('refuse une plage à une seule borne', () => {
    // Une ouverture se lit « de X à Y » : une borne seule ouvrirait à minuit.
    expect(hoursIssueOf(withRange('pro', '', '06:30'))).not.toBe('');
    expect(hoursIssueOf(withRange('pro', '05:00', ''))).not.toBe('');
  });

  it('refuse une fermeture avant l’ouverture', () => {
    expect(hoursIssueOf(withRange('pro', '07:00', '06:00'))).not.toBe('');
  });

  it('ne retient pas une plage à une seule borne, même si l’écran la laissait passer', () => {
    expect(toPickupOpening(withRange('pro', '', '06:30')).proPickup).toBeNull();
  });

  it('garde les deux plages SÉPARÉES, jamais fusionnées', () => {
    const entries = openingEntries({
      proPickup: { start: '05:00', end: '06:30' },
      publicOpening: { start: '07:00', end: '20:00' },
    });
    const opening = toPickupOpening(entries);

    expect(opening.proPickup).toEqual({ start: '05:00', end: '06:30' });
    expect(opening.publicOpening).toEqual({ start: '07:00', end: '20:00' });
  });

  it('fait l’aller-retour heures → lignes → heures', () => {
    const opening = {
      proPickup: { start: '05:00', end: '06:30' },
      publicOpening: { start: '07:00', end: '20:00' },
    };

    expect(toPickupOpening(openingEntries(opening))).toEqual(opening);
  });

  it('n’affiche rien quand aucune heure n’est déclarée', () => {
    // La liste vide est le signal que l'écran doit dire « toute heure acceptée ».
    expect(openingRows({ proPickup: null, publicOpening: null })).toEqual([]);
  });

  it('affiche le créneau pro en tête, et lit une borne basse absente', () => {
    const rows = openingRows({
      proPickup: { start: null, end: '06:30' },
      publicOpening: { start: '07:00', end: '20:00' },
    });

    expect(rows.map((row) => row.label)).toEqual(['Créneau pro', 'Ouverture au public']);
    expect(formatTimeRange(rows[0]!.range)).toBe("jusqu'à 06:30");
    expect(formatTimeRange(rows[1]!.range)).toBe('07:00–20:00');
  });
});
