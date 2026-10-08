import { describe, expect, it } from 'vitest';

import {
  batchMonthName,
  closedMonthKey,
  currentMonthName,
  emptyPreviewSentence,
  longDay,
  monthToPrepareKey,
  monthToPrepareName,
  notYetOpenSentence,
  ofMonth,
} from '../collection-month-wording';

/** Clôture du 1er novembre 2026, 00h00 de Paris (heure d'hiver). */
const NOVEMBER_FIRST = '2026-10-31T23:00:00.000Z';
/** Clôture du 1er octobre 2026, 00h00 de Paris (heure d'été). */
const OCTOBER_FIRST = '2026-09-30T22:00:00.000Z';

describe('les mots du prélèvement du mois', () => {
  it('nomme le mois de l’aperçu et celui dont on prépare le lot, lus à Paris', () => {
    expect(currentMonthName(NOVEMBER_FIRST)).toBe('octobre');
    expect(monthToPrepareName(NOVEMBER_FIRST)).toBe('septembre');
    expect(batchMonthName(OCTOBER_FIRST)).toBe('septembre');
  });

  it('compare les mois avec leur année', () => {
    expect(closedMonthKey(OCTOBER_FIRST)).toBe('2026-09');
    expect(monthToPrepareKey(NOVEMBER_FIRST)).toBe('2026-09');
    expect(monthToPrepareKey('2027-01-31T23:00:00.000Z')).toBe('2026-12');
  });

  it('janvier prépare le lot de décembre', () => {
    expect(monthToPrepareName('2027-01-31T23:00:00.000Z')).toBe('décembre');
  });

  it('élide devant une voyelle', () => {
    expect(ofMonth('septembre')).toBe('de septembre');
    expect(ofMonth('octobre')).toBe('d’octobre');
    expect(ofMonth('août')).toBe('d’août');
  });

  it('dit « 1er » et le jour de Paris', () => {
    expect(longDay(NOVEMBER_FIRST)).toBe('1er novembre 2026');
  });

  it('explique un mois pas encore prélevable par ses deux dates', () => {
    expect(notYetOpenSentence('2026-11-05T08:00:00.000Z', '2026-11-30T23:00:00.000Z')).toBe(
      'Le premier mois prélevable se clôt le 1er décembre 2026 : les commandes passées avant le 5 novembre 2026 (mise en service du prélèvement) n’entrent dans aucun lot.',
    );
  });

  it('un aperçu vide dit qu’il ne reste rien depuis la mise en service', () => {
    expect(emptyPreviewSentence('2026-08-01T00:00:00.000Z')).toBe(
      'Aucune commande au compte n’attend d’être prélevée : ni ce mois-ci, ni d’un mois précédent depuis la mise en service du prélèvement (1er août 2026).',
    );
  });
});
