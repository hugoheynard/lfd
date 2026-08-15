import {
  EMPTY_OPENING_DRAFT,
  openingDraftFrom,
  openingIssueOf,
  openingRows,
  toPickupOpening,
} from '../pickup-opening.model';

describe('le brouillon des heures de retrait', () => {
  it('ne déclare aucune fenêtre quand rien n’est saisi', () => {
    expect(openingIssueOf(EMPTY_OPENING_DRAFT)).toBe('');
    expect(toPickupOpening(EMPTY_OPENING_DRAFT)).toEqual({
      publicOpening: null,
      proPickup: null,
    });
  });

  it('refuse une plage à une seule borne', () => {
    // Une ouverture se lit « de X à Y » : une borne seule ouvrirait à minuit.
    expect(openingIssueOf({ ...EMPTY_OPENING_DRAFT, proEnd: '06:30' })).not.toBe('');
    expect(openingIssueOf({ ...EMPTY_OPENING_DRAFT, proStart: '05:00' })).not.toBe('');
  });

  it('refuse une fermeture avant l’ouverture', () => {
    expect(openingIssueOf({ ...EMPTY_OPENING_DRAFT, proStart: '07:00', proEnd: '06:00' })).not.toBe(
      '',
    );
  });

  it('garde les deux plages SÉPARÉES, jamais fusionnées', () => {
    const opening = toPickupOpening({
      proStart: '05:00',
      proEnd: '06:30',
      publicStart: '07:00',
      publicEnd: '20:00',
    });

    expect(opening.proPickup).toEqual({ start: '05:00', end: '06:30' });
    expect(opening.publicOpening).toEqual({ start: '07:00', end: '20:00' });
  });

  it('fait l’aller-retour vue → brouillon → vue', () => {
    const opening = {
      proPickup: { start: '05:00', end: '06:30' },
      publicOpening: { start: '07:00', end: '20:00' },
    };

    expect(toPickupOpening(openingDraftFrom(opening))).toEqual(opening);
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

    expect(rows.map((row) => row.label)).toEqual(['Pro', 'Public']);
    expect(rows[0]?.text).toBe("jusqu'à 06:30");
    expect(rows[1]?.text).toBe('07:00–20:00');
  });
});
