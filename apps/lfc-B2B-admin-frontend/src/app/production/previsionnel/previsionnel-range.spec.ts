import { describe, expect, it } from 'vitest';

import { forecastHeaders, shiftDay, windowEnd } from './previsionnel-range';

describe('la plage du prévisionnel', () => {
  it('ferme une fenêtre de sept jours sur J+6, bornes comprises', () => {
    expect(windowEnd('2026-09-03')).toBe('2026-09-09');
  });

  it('décale de sept jours en avant comme en arrière', () => {
    expect(shiftDay('2026-09-03', 7)).toBe('2026-09-10');
    expect(shiftDay('2026-09-03', -7)).toBe('2026-08-27');
  });

  /**
   * 🔴 En heure locale, `setDate()` redouble un jour au passage à l'heure
   * d'hiver — une colonne fantôme dans la grille, et le serveur qui rendrait
   * alors une plage d'une autre longueur que celle demandée.
   */
  it('ne perd ni ne redouble un jour au changement d’heure', () => {
    expect(windowEnd('2026-10-24')).toBe('2026-10-30');
    expect(shiftDay('2026-10-25', 1)).toBe('2026-10-26');
  });

  it('dit la distance plutôt que la date — c’est la vraie question', () => {
    const headers = forecastHeaders(
      [
        { date: '2026-09-03', totalUnits: 100, orderCount: 12, closed: true },
        { date: '2026-09-04', totalUnits: 200, orderCount: 9, closed: false },
        { date: '2026-09-05', totalUnits: 900, orderCount: 47, closed: false },
      ],
      '2026-09-05',
      '2026-09-03',
    );
    expect(headers.map((header) => header.offset)).toEqual(['aujourd’hui', 'J+1', 'J+2']);
    expect(headers.map((header) => header.today)).toEqual([true, false, false]);
    expect(headers.map((header) => header.closed)).toEqual([true, false, false]);
    // Le compte de commandes traverse sans être retouché : c'est le pied de la
    // table qui le lit, et il vient de la même source que les pièces.
    expect(headers.map((header) => header.orderCount)).toEqual([12, 9, 47]);
  });

  it('compte à rebours sur une fenêtre déjà passée', () => {
    const headers = forecastHeaders(
      [{ date: '2026-09-01', totalUnits: 0, orderCount: 0, closed: true }],
      null,
      '2026-09-03',
    );
    expect(headers[0]?.offset).toBe('J−2');
  });

  /**
   * Le pic vient du SERVEUR. Le déduire de ce qui est affiché donnerait un pic
   * différent selon la plage ouverte — donc un pic qui bouge quand on navigue.
   */
  it('marque le pic que le serveur a désigné, même si ce n’est pas le maximum affiché', () => {
    const headers = forecastHeaders(
      [
        { date: '2026-09-03', totalUnits: 100, orderCount: 3, closed: false },
        { date: '2026-09-04', totalUnits: 900, orderCount: 21, closed: false },
      ],
      '2026-09-03',
      '2026-09-03',
    );
    expect(headers.map((header) => header.peak)).toEqual([true, false]);
  });

  it('ne marque aucun pic quand le serveur n’en désigne pas', () => {
    const headers = forecastHeaders(
      [{ date: '2026-09-03', totalUnits: 0, orderCount: 0, closed: false }],
      null,
      '2026-09-03',
    );
    expect(headers[0]?.peak).toBe(false);
  });

  it('abrège le jour et la date en français', () => {
    const headers = forecastHeaders(
      [{ date: '2026-09-03', totalUnits: 0, orderCount: 0, closed: false }],
      null,
      '2026-09-03',
    );
    expect(headers[0]?.weekday).toBe('jeu.');
    expect(headers[0]?.dayMonth).toBe('3 sept.');
  });
});
