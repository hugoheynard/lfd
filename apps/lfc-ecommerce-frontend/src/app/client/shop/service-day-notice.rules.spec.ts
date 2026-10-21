import { describe, expect, it } from 'vitest';

import { decideDayNotice, type DayNoticeInput, limitHasPassed } from './service-day-notice.rules';

/**
 * Horloge INJECTÉE : les dates ne se comparent qu'entre elles et à cet
 * instant figé, jamais au calendrier du jour où la suite tourne.
 *
 * Mardi 20 octobre 2026 à Paris (heure d'été, UTC+2).
 */
const TUESDAY = '2026-10-20';
const WEDNESDAY = '2026-10-21';
const THURSDAY = '2026-10-22';
/** La règle de prod : la veille à 23 h — mardi 23 h Paris = 21:00Z. */
const TUESDAY_23H = '2026-10-20T21:00:00.000Z';
/** Mardi, une heure donnée à Paris. */
const tuesdayAt = (hhmm: string): Date => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2026, 9, 20, h - 2, m));
};

function input(over: Partial<DayNoticeInput> = {}): DayNoticeInput {
  return {
    now: tuesdayAt('15:00'),
    held: WEDNESDAY,
    first: WEDNESDAY,
    firstOrderUntil: TUESDAY_23H,
    tomorrowOrderUntil: null,
    byOperation: false,
    cartLimits: [],
    ...over,
  };
}

describe('decideDayNotice', () => {
  /**
   * Régression (démo du 2026-10-21) : la boutique de prod disait « Trop tard
   * pour demain » parce que le jour GARDÉ était jeudi, alors que le serveur
   * accordait mercredi. Mardi 15 h, limite la veille à 23 h : 8 h devant soi,
   * donc ni « trop tard » ni « Plus que 8 h » — la forme calme.
   */
  it('mardi 15 h, jour gardé jeudi : aucun « trop tard », la forme calme', () => {
    const notice = decideDayNotice(input({ held: THURSDAY }));

    expect(notice).toEqual({ kind: 'calm', first: WEDNESDAY, until: new Date(TUESDAY_23H) });
  });

  it('compte à rebours sous six heures', () => {
    expect(decideDayNotice(input({ now: tuesdayAt('20:45') }))).toEqual({
      kind: 'countdown',
      first: WEDNESDAY,
      minutesLeft: 135,
    });
  });

  it('pile six heures : on compte ; une minute de plus : forme calme', () => {
    expect(decideDayNotice(input({ now: tuesdayAt('17:00') }))?.kind).toBe('countdown');
    expect(decideDayNotice(input({ now: tuesdayAt('16:59') }))?.kind).toBe('calm');
  });

  it('les dernières secondes disent encore une minute, jamais zéro', () => {
    const now = new Date(new Date(TUESDAY_23H).getTime() - 20_000);
    expect(decideDayNotice(input({ now }))).toMatchObject({ minutesLeft: 1 });
  });

  it('se tait sans limite, ou quand la limite ne tombe pas aujourd’hui', () => {
    expect(decideDayNotice(input({ firstOrderUntil: null }))).toBeNull();
    expect(decideDayNotice(input({ firstOrderUntil: '2026-10-21T21:00:00.000Z' }))).toBeNull();
  });

  it('se tait une fois la limite passée : la relecture tranchera', () => {
    expect(decideDayNotice(input({ now: tuesdayAt('23:01') }))).toBeNull();
  });

  it('« trop tard » quand le premier jour accordé est après demain, avec l’heure lue', () => {
    const notice = decideDayNotice(
      input({
        now: tuesdayAt('23:30'),
        held: THURSDAY,
        first: THURSDAY,
        firstOrderUntil: '2026-10-21T21:00:00.000Z',
        tomorrowOrderUntil: TUESDAY_23H,
      }),
    );
    expect(notice).toEqual({ kind: 'late', held: THURSDAY, passedAt: new Date(TUESDAY_23H) });
  });

  it('« trop tard » sans heure quand celle de demain n’a pas été lue', () => {
    const notice = decideDayNotice(input({ held: THURSDAY, first: THURSDAY }));
    expect(notice).toEqual({ kind: 'late', held: THURSDAY, passedAt: null });
  });

  it('une opération datée : la raison est l’opération, pas la limite', () => {
    const notice = decideDayNotice(input({ held: THURSDAY, first: THURSDAY, byOperation: true }));
    expect(notice).toEqual({ kind: 'operation', first: THURSDAY });
  });

  it('un jour gardé antérieur au premier accordé : « slipped »', () => {
    expect(decideDayNotice(input({ held: TUESDAY }))).toEqual({
      kind: 'slipped',
      held: TUESDAY,
      first: WEDNESDAY,
    });
  });

  it('se tait quand le serveur n’a rien accordé', () => {
    expect(decideDayNotice(input({ first: null }))).toBeNull();
  });
});

describe('limitHasPassed', () => {
  it('vrai une fois la limite franchie, pas à la seconde même', () => {
    expect(limitHasPassed(TUESDAY_23H, new Date(TUESDAY_23H))).toBe(false);
    expect(limitHasPassed(TUESDAY_23H, tuesdayAt('23:01'))).toBe(true);
    expect(limitHasPassed(null, tuesdayAt('23:01'))).toBe(false);
  });
});

/**
 * 🔴 La limite d'un ARTICLE du panier, plus stricte que la générale, décide
 * pour ce jour (Hugo, 2026-10-21) : « Plus que 1 h 40 pour commander la bûche
 * pour jeudi ».
 */
describe('decideDayNotice — la limite d’un article du panier', () => {
  const BUCHE = { name: 'la bûche', limit: { daysBefore: 1, time: '18:00' } };

  it('la veille à 18 h, mardi 16 h 20 : le compte à rebours nomme l’article', () => {
    const notice = decideDayNotice(input({ now: tuesdayAt('16:20'), cartLimits: [BUCHE] }));

    expect(notice).toEqual({
      kind: 'countdown',
      first: WEDNESDAY,
      minutesLeft: 100,
      item: 'la bûche',
    });
  });

  it('plus de six heures devant soi : la forme calme, à l’heure de l’article', () => {
    const notice = decideDayNotice(input({ now: tuesdayAt('09:00'), cartLimits: [BUCHE] }));

    expect(notice).toEqual({
      kind: 'calm',
      first: WEDNESDAY,
      until: tuesdayAt('18:00'),
      item: 'la bûche',
    });
  });

  it('la plus fermée du panier l’emporte', () => {
    const tart = { name: 'la tarte', limit: { daysBefore: 1, time: '20:00' } };

    const notice = decideDayNotice(input({ now: tuesdayAt('16:20'), cartLimits: [tart, BUCHE] }));

    expect(notice).toMatchObject({ kind: 'countdown', item: 'la bûche' });
  });

  it('une limite d’article plus LÂCHE que la générale ne la remplace pas', () => {
    const sameDay = { name: 'le pain', limit: { daysBefore: 0, time: '09:00' } };

    const notice = decideDayNotice(input({ now: tuesdayAt('20:00'), cartLimits: [sameDay] }));

    expect(notice).toEqual({ kind: 'countdown', first: WEDNESDAY, minutesLeft: 180 });
  });

  it('sans règle générale annoncée, l’article décide seul', () => {
    const notice = decideDayNotice(
      input({ now: tuesdayAt('16:20'), firstOrderUntil: null, cartLimits: [BUCHE] }),
    );

    expect(notice).toMatchObject({ kind: 'countdown', minutesLeft: 100, item: 'la bûche' });
  });
});
