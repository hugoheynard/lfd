import { describe, expect, it } from 'vitest';

import {
  cycleOf,
  draftOf,
  EMPTY_SCHEDULE,
  formatDay,
  parisInstant,
  pickupPhrase,
  readSchedule,
  type ScheduleDraft,
} from '../operation-schedule';

/**
 * La conversion heure de Paris → instant, autour des deux bascules de 2026
 * (été le 29 mars, hiver le 25 octobre).
 *
 * Les dates sont ABSOLUES, et c'est l'exception admise : elles sont le sujet
 * du test et ne sont jamais comparées à l'horloge — seulement à l'instant UTC
 * qu'elles doivent produire.
 */
describe('parisInstant', () => {
  it('la veille du passage à l’heure d’hiver, Paris est à UTC+2', () => {
    expect(parisInstant('2026-10-24', '12:00')).toBe('2026-10-24T10:00:00.000Z');
  });

  it('le lendemain, Paris est à UTC+1', () => {
    expect(parisInstant('2026-10-26', '12:00')).toBe('2026-10-26T11:00:00.000Z');
  });

  it('minuit du jour de la bascule est encore en heure d’été', () => {
    expect(parisInstant('2026-10-25', '00:00')).toBe('2026-10-24T22:00:00.000Z');
  });

  it('l’heure ambiguë d’octobre (2 h 30 existe deux fois) retient la première', () => {
    expect(parisInstant('2026-10-25', '02:30')).toBe('2026-10-25T00:30:00.000Z');
  });

  it('après la bascule, le même jour, on est passé à UTC+1', () => {
    expect(parisInstant('2026-10-25', '12:00')).toBe('2026-10-25T11:00:00.000Z');
  });

  it('une heure qui n’existe pas (nuit du passage à l’heure d’été) rend null', () => {
    expect(parisInstant('2026-03-29', '02:30')).toBeNull();
  });

  /**
   * Régression redoutée : un minuit UTC collé au jour (`${day}T00:00Z`)
   * ouvrirait l'annonce à 1 h ou 2 h du matin à Paris.
   */
  it('minuit à Paris n’est jamais minuit UTC', () => {
    expect(parisInstant('2026-12-01', '00:00')).toBe('2026-11-30T23:00:00.000Z');
  });
});

const NOEL: ScheduleDraft = {
  announceDay: '2026-11-01',
  announceTime: '00:00',
  orderFromDay: '2026-11-15',
  orderFromTime: '08:00',
  orderUntilDay: '2026-12-21',
  orderUntilTime: '12:00',
  pickupFrom: '2026-12-23',
  pickupUntil: '2026-12-24',
};

describe('readSchedule', () => {
  it('convertit les trois instants en heure de Paris et laisse les jours tels quels', () => {
    expect(readSchedule(NOEL)).toEqual({
      ok: true,
      payload: {
        announceFrom: '2026-10-31T23:00:00.000Z',
        orderFrom: '2026-11-15T07:00:00.000Z',
        orderUntil: '2026-12-21T11:00:00.000Z',
        pickupFrom: '2026-12-23',
        pickupUntil: '2026-12-24',
      },
    });
  });

  it('une ouverture laissée vide veut dire « dès l’annonce »', () => {
    const reading = readSchedule({ ...NOEL, orderFromDay: '', orderFromTime: '' });
    expect(reading.ok && reading.payload.orderFrom).toBeNull();
  });

  it('une ouverture à moitié saisie est refusée, en disant les deux sorties', () => {
    const reading = readSchedule({ ...NOEL, orderFromTime: '' });
    expect(reading.ok).toBe(false);
    expect(!reading.ok && reading.problem).toContain('laissez les deux vides');
  });

  it('une annonce sans heure est refusée', () => {
    const reading = readSchedule({ ...NOEL, announceTime: '' });
    expect(!reading.ok && reading.problem).toContain("l'annonce");
  });

  it('une heure inexistante est nommée, avec la raison', () => {
    const reading = readSchedule({ ...NOEL, announceDay: '2026-03-29', announceTime: '02:30' });
    expect(!reading.ok && reading.problem).toContain("passage à l'heure d'été");
  });

  it('les jours de retrait sont obligatoires', () => {
    expect(readSchedule({ ...NOEL, pickupUntil: '' }).ok).toBe(false);
  });

  it('rien de saisi ne passe', () => {
    expect(readSchedule(EMPTY_SCHEDULE).ok).toBe(false);
  });

  /** L'ordre des dates est la règle de l'agrégat : l'écran ne la double pas. */
  it('ne vérifie pas l’ordre des dates — le serveur le fait et le dit', () => {
    expect(readSchedule({ ...NOEL, pickupFrom: '2026-12-30' }).ok).toBe(true);
  });
});

describe('draftOf', () => {
  it('relit en heure de Paris ce que readSchedule a écrit', () => {
    const reading = readSchedule(NOEL);
    if (!reading.ok) {
      throw new Error(reading.problem);
    }
    expect(draftOf(reading.payload)).toEqual(NOEL);
  });

  it('une ouverture nulle redonne deux champs vides', () => {
    const draft = draftOf({
      announceFrom: '2026-10-31T23:00:00.000Z',
      orderFrom: null,
      orderUntil: '2026-12-21T11:00:00.000Z',
      pickupFrom: '2026-12-23',
      pickupUntil: '2026-12-24',
    });
    expect([draft.orderFromDay, draft.orderFromTime]).toEqual(['', '']);
  });
});

describe('lecture du cycle', () => {
  it('écrit un jour à la française, sans passer par un fuseau', () => {
    expect(formatDay('2026-12-24')).toBe('jeu. 24 déc. 2026');
  });

  it('dit un retrait sur un seul jour autrement qu’une plage', () => {
    expect(pickupPhrase('2026-12-24', '2026-12-24')).toBe('le jeu. 24 déc. 2026');
    expect(pickupPhrase('2026-12-23', '2026-12-24')).toBe(
      'du mer. 23 déc. 2026 au jeu. 24 déc. 2026',
    );
  });

  it('déroule annonce → commandes → retrait → fin, en heure de Paris', () => {
    const steps = cycleOf({
      announceFrom: '2026-10-31T23:00:00.000Z',
      orderFrom: null,
      orderUntil: '2026-12-21T11:00:00.000Z',
      pickupFrom: '2026-12-23',
      pickupUntil: '2026-12-24',
    });
    expect(steps.map((step) => step.label)).toEqual(['Annonce', 'Commandes', 'Retrait', 'Fin']);
    expect(steps[0]?.when).toBe('à partir du dim. 1 nov. 2026 à 00:00');
    expect(steps[1]?.when).toBe("dès l'annonce, jusqu'au lun. 21 déc. 2026 à 12:00");
  });
});
