import { describe, expect, it } from 'vitest';

import type { DaySupervisionView } from '@lfd/contracts';

import {
  dayDiff,
  dayStripOf,
  serverDayOf,
  serviceDayParam,
  shiftServiceDay,
  stampOf,
} from './supervision-day';

describe('shiftServiceDay', () => {
  it('passe au lendemain et à la veille', () => {
    expect(shiftServiceDay('2026-09-28', 1)).toBe('2026-09-29');
    expect(shiftServiceDay('2026-09-28', -1)).toBe('2026-09-27');
  });

  it('franchit les fins de mois et d’année', () => {
    expect(shiftServiceDay('2026-09-30', 1)).toBe('2026-10-01');
    expect(shiftServiceDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftServiceDay('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('ne saute ni ne répète un jour au changement d’heure', () => {
    expect(shiftServiceDay('2026-10-24', 1)).toBe('2026-10-25');
    expect(shiftServiceDay('2026-10-25', 1)).toBe('2026-10-26');
    expect(shiftServiceDay('2026-03-29', -1)).toBe('2026-03-28');
  });
});

describe('serviceDayParam', () => {
  it('garde une date bien formée', () => {
    expect(serviceDayParam('2026-09-29')).toBe('2026-09-29');
  });

  it.each([null, '', 'demain', '2026-9-29', '2026-09-29T00:00'])('écarte %s', (raw) => {
    expect(serviceDayParam(raw)).toBeNull();
  });
});

const MINUTE = 60_000;
const CYCLE = 60_000;

/** Un jour lu il y a `ageMs` : l'instant de lecture est RELATIF à l'horloge du test. */
function view(date: string, now: number, ageMs: number): DaySupervisionView {
  return { date, asOf: new Date(now - ageMs).toISOString(), flow: [], late: [], undated: 0 };
}

describe('dayDiff', () => {
  it('compte les jours d’écart, fins de mois comprises', () => {
    expect(dayDiff('2026-10-01', '2026-09-30')).toBe(1);
    expect(dayDiff('2026-09-24', '2026-09-25')).toBe(-1);
    expect(dayDiff('2026-09-25', '2026-09-25')).toBe(0);
  });
});

describe('serverDayOf', () => {
  it('sans date choisie, le jour rendu est celui du serveur', () => {
    expect(serverDayOf(view('2026-09-25', Date.now(), 0), null)).toBe('2026-09-25');
  });

  it('avec une date choisie, lit le jour de Paris de l’horloge du serveur', () => {
    const asOf = '2026-09-25T21:30:00.000Z'; // 23 h 30 à Paris : encore le 25.
    const chosen: DaySupervisionView = { ...view('2026-09-20', 0, 0), asOf };
    expect(serverDayOf(chosen, '2026-09-20')).toBe('2026-09-25');
  });
});

describe('dayStripOf — Supervision v2, A2', () => {
  it('se tait le jour même', () => {
    expect(dayStripOf('2026-09-25', 0)).toBeNull();
  });

  it('dit la relecture d’un jour passé, et l’avenir d’un jour à venir', () => {
    expect(dayStripOf('2026-09-24', -1)).toMatchObject({ past: true, chip: 'Hier · relecture' });
    expect(dayStripOf('2026-09-20', -5)?.chip).toBe('Relecture');
    expect(dayStripOf('2026-09-26', 1)).toMatchObject({ past: false, chip: 'Demain · à venir' });
    expect(dayStripOf('2026-09-26', 1)?.text).toContain('Plan pas encore arrêté');
  });
});

describe('stampOf — la fraîcheur', () => {
  const now = Date.now();

  it('est à jour quand la lecture a moins d’un cycle', () => {
    expect(stampOf(view('2026-09-25', now, 10_000), 0, false, now, CYCLE)?.tone).toBe('fresh');
  });

  it('passe en retard si la relecture a échoué, ou date de plus d’un cycle', () => {
    const late = stampOf(view('2026-09-25', now, 4 * MINUTE), 0, false, now, CYCLE);
    expect(late?.tone).toBe('late');
    expect(late?.wide).toContain('relecture en retard de 4 min');
    expect(stampOf(view('2026-09-25', now, 0), 0, true, now, CYCLE)?.tone).toBe('late');
  });

  it('un autre jour dit s’il est clos ou ouvert', () => {
    expect(stampOf(view('2026-09-24', now, 0), -1, false, now, CYCLE)?.wide).toContain('close');
    expect(stampOf(view('2026-09-26', now, 0), 1, false, now, CYCLE)?.wide).toContain(
      'plan ouvert',
    );
    expect(stampOf(null, 0, false, now, CYCLE)).toBeNull();
  });
});
