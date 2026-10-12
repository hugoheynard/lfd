import { describe, expect, it } from 'vitest';

import {
  emptyPreviewSentence,
  longDay,
  notYetOpenSentence,
  periodBetween,
  sameClosure,
} from '../collection-month-wording';

/** Clôture du 1er novembre 2026, 00h00 de Paris (heure d'hiver). */
const NOVEMBER_FIRST = '2026-10-31T23:00:00.000Z';
/** Clôture du 1er octobre 2026, 00h00 de Paris (heure d'été). */
const OCTOBER_FIRST = '2026-09-30T22:00:00.000Z';
/** Clôture du lundi 5 octobre 2026, 00h00 de Paris. */
const OCTOBER_FIFTH = '2026-10-04T22:00:00.000Z';

describe('les mots du prélèvement, clôture par clôture', () => {
  it('dit la période d’un lot en jours de Paris, dernier jour inclus', () => {
    expect(periodBetween(OCTOBER_FIRST, NOVEMBER_FIRST)).toBe('du 1er au 31 octobre 2026');
    expect(periodBetween(OCTOBER_FIRST, OCTOBER_FIFTH)).toBe('du 1er au 4 octobre 2026');
  });

  it('nomme les deux mois, puis les deux années, quand la période les traverse', () => {
    expect(periodBetween('2026-09-27T22:00:00.000Z', OCTOBER_FIFTH)).toBe(
      'du 28 septembre au 4 octobre 2026',
    );
    expect(periodBetween('2026-12-27T23:00:00.000Z', '2027-01-03T23:00:00.000Z')).toBe(
      'du 28 décembre 2026 au 3 janvier 2027',
    );
  });

  it('reconnaît une même clôture écrite de deux façons', () => {
    expect(sameClosure(OCTOBER_FIRST, '2026-10-01T00:00:00.000+02:00')).toBe(true);
    expect(sameClosure(OCTOBER_FIRST, OCTOBER_FIFTH)).toBe(false);
  });

  it('dit « 1er » et le jour de Paris', () => {
    expect(longDay(NOVEMBER_FIRST)).toBe('1er novembre 2026');
  });

  it('explique une période pas encore prélevable par ses deux dates', () => {
    expect(notYetOpenSentence('2026-11-05T08:00:00.000Z', '2026-11-30T23:00:00.000Z')).toBe(
      'La première période prélevable se clôt le 1er décembre 2026 : les commandes passées avant le 5 novembre 2026 (mise en service du prélèvement) n’entrent dans aucun lot.',
    );
  });

  it('un aperçu vide dit qu’il ne reste rien depuis la mise en service', () => {
    expect(emptyPreviewSentence('2026-08-01T00:00:00.000Z')).toBe(
      'Aucune commande au compte n’attend d’être prélevée : ni de cette période, ni d’une période précédente depuis la mise en service du prélèvement (1er août 2026).',
    );
  });
});
