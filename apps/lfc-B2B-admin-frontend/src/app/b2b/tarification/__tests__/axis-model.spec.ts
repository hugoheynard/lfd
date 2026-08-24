import { describe, expect, it } from 'vitest';

import {
  axisSpan,
  dayStart,
  instantAt,
  monthTicks,
  packLanes,
  percentOf,
  snapToDay,
  weekTicks,
} from '../frise/axis-model';

/**
 * **La géométrie de l'axe.**
 *
 * Deux garanties : l'axe couvre toujours aujourd'hui — une frise qui s'arrêterait
 * à la dernière décision laisserait croire que le temps s'est arrêté avec elle —
 * et un instant se pose au JOUR, parce que le pointeur offre une précision que la
 * donnée n'a pas.
 */

const NOW = Date.parse('2026-08-17T12:00:00.000Z');
const band = (from: string, to: string | null) => ({ validFrom: from, validTo: to });

describe("l'étendue de l'axe", () => {
  it('couvre aujourd’hui même quand toutes les décisions sont anciennes', () => {
    const span = axisSpan([band('2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z')], NOW);

    expect(span.from).toBeLessThan(Date.parse('2026-01-01T00:00:00.000Z'));
    expect(span.to).toBeGreaterThan(NOW);
  });

  it('couvre aussi une décision à venir', () => {
    const future = Date.parse('2026-12-01T00:00:00.000Z');
    const span = axisSpan([band('2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z')], NOW);

    expect(span.to).toBeGreaterThanOrEqual(future);
    expect(span.from).toBeLessThan(NOW);
  });

  /** Sans décision, l'axe existe quand même : il ne divise jamais par zéro. */
  it('garde une durée sans aucune décision', () => {
    const span = axisSpan([], NOW);

    expect(span.to).toBeGreaterThan(span.from);
  });
});

describe('la conversion instant ↔ position', () => {
  const span = {
    from: Date.parse('2026-08-01T00:00:00.000Z'),
    to: Date.parse('2026-08-31T00:00:00.000Z'),
  };

  it('place le milieu au milieu', () => {
    expect(Math.round(percentOf(span, Date.parse('2026-08-16T00:00:00.000Z')))).toBe(50);
  });

  /** Un instant hors de l'axe se borne : une barre qui déborde se lit comme un bug. */
  it('borne un instant qui sort de la fenêtre', () => {
    expect(percentOf(span, Date.parse('2020-01-01T00:00:00.000Z'))).toBe(0);
    expect(percentOf(span, Date.parse('2030-01-01T00:00:00.000Z'))).toBe(100);
  });

  it('retrouve l’instant depuis la position', () => {
    const at = instantAt(span, 50);

    expect(snapToDay(at)).toBe('2026-08-16');
  });

  it('borne une position hors piste', () => {
    expect(instantAt(span, -20)).toBe(span.from);
    expect(instantAt(span, 200)).toBe(span.to);
  });

  /** Le pointeur donne des millisecondes ; la donnée, elle, est datée au jour. */
  it('arrondit au jour, et rend un instant ISO exploitable', () => {
    expect(snapToDay(Date.parse('2026-08-16T23:59:00.000Z'))).toBe('2026-08-16');
    expect(dayStart('2026-08-16')).toBe('2026-08-16T00:00:00.000Z');
  });
});

describe('les graduations', () => {
  it('pose un repère par mois entamé', () => {
    const ticks = monthTicks({
      from: Date.parse('2026-07-15T00:00:00.000Z'),
      to: Date.parse('2026-10-05T00:00:00.000Z'),
    });

    expect(ticks.map((tick) => tick.label)).toEqual(['août 26', 'sept. 26', 'oct. 26']);
  });
});

describe('les semaines', () => {
  const span = {
    from: Date.parse('2026-08-01T00:00:00.000Z'),
    to: Date.parse('2026-08-31T00:00:00.000Z'),
  };

  /** Le mois SITUE, la semaine permet de VISER : « vers le 20 » se pointe. */
  it('pose un trait par lundi, et rien entre', () => {
    const ticks = weekTicks(span);

    // Août 2026 : les lundis sont les 3, 10, 17, 24 et 31.
    expect(ticks.map((tick) => tick.label)).toEqual(['3', '10', '17', '24', '31']);
  });

  it('reste dans les bornes de l’axe', () => {
    for (const tick of weekTicks(span)) {
      expect(tick.percent).toBeGreaterThanOrEqual(0);
      expect(tick.percent).toBeLessThanOrEqual(100);
    }
  });
});

describe('le rangement en voies', () => {
  const span = {
    from: Date.parse('2026-08-01T00:00:00.000Z'),
    to: Date.parse('2026-12-31T00:00:00.000Z'),
  };
  const band = (validFrom: string, validTo: string | null) => ({ validFrom, validTo });

  /**
   * Une ligne par décision donnait une frise haute comme un immeuble. Rangées,
   * celles qui se succèdent partagent leur ligne.
   */
  it('met deux périodes qui se succèdent sur la MÊME voie', () => {
    const lanes = packLanes(
      [
        band('2026-08-01T00:00:00.000Z', '2026-08-20T00:00:00.000Z'),
        band('2026-09-01T00:00:00.000Z', '2026-09-20T00:00:00.000Z'),
      ],
      span,
    );

    expect(lanes.map((entry) => entry.lane)).toEqual([0, 0]);
  });

  /** Celles qui se recouvrent VRAIMENT s'empilent — ce sont les seules. */
  it('empile deux périodes qui se recouvrent', () => {
    const lanes = packLanes(
      [
        band('2026-08-01T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
        band('2026-08-15T00:00:00.000Z', '2026-09-15T00:00:00.000Z'),
      ],
      span,
    );

    expect(lanes.map((entry) => entry.lane)).toEqual([0, 1]);
  });

  /** Une fin ouverte occupe sa voie jusqu'au bout de l'axe. */
  it('garde sa voie pour une décision sans terme', () => {
    const lanes = packLanes(
      [
        band('2026-08-01T00:00:00.000Z', null),
        band('2026-10-01T00:00:00.000Z', '2026-10-10T00:00:00.000Z'),
      ],
      span,
    );

    expect(lanes.map((entry) => entry.lane)).toEqual([0, 1]);
  });
});
