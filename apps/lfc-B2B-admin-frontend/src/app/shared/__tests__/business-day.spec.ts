import { describe, expect, it } from 'vitest';

import { businessDayStart } from '../business-day';

/**
 * **Minuit, mais chez qui ?**
 *
 * Un commercial qui écrit « à partir du 1er janvier » veut dire minuit à Paris.
 * Le code disait minuit UTC jusqu'au 2026-09-08, et la différence n'est pas
 * constante : une heure en hiver, deux en été.
 *
 * 🔴 **Les deux saisons sont éprouvées, et c'est le point.** Un test d'hiver
 * seul passe avec un décalage codé en dur — c'est exactement l'erreur qu'on
 * corrigerait en croyant l'avoir corrigée.
 */
describe('le début d’une journée d’exploitation', () => {
  it('🔴 ouvre à 23 h UTC la veille en HIVER (UTC+1)', () => {
    // Le 1er janvier à 00 h 00 à Paris, c'est le 31 décembre à 23 h 00 UTC.
    expect(businessDayStart('2026-01-01')).toBe('2025-12-31T23:00:00.000Z');
  });

  it('🔴 ouvre à 22 h UTC la veille en ÉTÉ (UTC+2)', () => {
    // Même jour du mois, décalage différent. Une constante « +1 h » serait
    // juste six mois sur douze, et personne ne saurait laquelle on regarde.
    expect(businessDayStart('2026-07-01')).toBe('2026-06-30T22:00:00.000Z');
  });

  it('bascule au bon jour, le dimanche du changement d’heure', () => {
    // 2026 : l'heure d'été commence le dimanche 29 mars. Le 29 à minuit est
    // encore en UTC+1 — le saut a lieu à 02 h locales.
    expect(businessDayStart('2026-03-29')).toBe('2026-03-28T23:00:00.000Z');
    // Le 30 mars, l'été est en place.
    expect(businessDayStart('2026-03-30')).toBe('2026-03-29T22:00:00.000Z');
  });

  it('n’est PAS minuit UTC — la régression que ce fichier existe pour attraper', () => {
    expect(businessDayStart('2026-01-01')).not.toBe('2026-01-01T00:00:00.000Z');
  });

  it('rend `null` sur un jour vide plutôt qu’un instant inventé', () => {
    // Une fenêtre absente et une fenêtre invalide ne se traitent pas pareil :
    // l'appelant décide, il n'hérite pas d'un « aujourd'hui » silencieux.
    expect(businessDayStart('')).toBeNull();
  });

  it('rend `null` sur un jour mal formé', () => {
    expect(businessDayStart('01/01/2026')).toBeNull();
    expect(businessDayStart('2026-13-45')).toBeNull();
  });
});
