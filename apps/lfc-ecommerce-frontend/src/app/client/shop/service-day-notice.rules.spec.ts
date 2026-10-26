import { describe, expect, it } from 'vitest';

import {
  dayNoLongerPossible,
  offersDayChange,
  decideDayNotice,
  type DayNoticeInput,
  firstPossibleDay,
  limitHasPassed,
} from './service-day-notice.rules';

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

/**
 * 🔴 Avant tout choix de service (Hugo, 2026-10-21) : la barre annonce le
 * premier jour de l'entrée par défaut et sa limite — et ne dit JAMAIS « trop
 * tard », puisque rien n'est encore choisi.
 */
describe('decideDayNotice — sans choix de service', () => {
  it('la forme calme du premier jour', () => {
    expect(decideDayNotice(input({ held: null }))).toEqual({
      kind: 'calm',
      first: WEDNESDAY,
      until: new Date(TUESDAY_23H),
    });
  });

  it('le compte à rebours sous six heures', () => {
    expect(decideDayNotice(input({ held: null, now: tuesdayAt('20:45') }))).toEqual({
      kind: 'countdown',
      first: WEDNESDAY,
      minutesLeft: 135,
    });
  });

  it('la limite plus stricte d’un article du panier', () => {
    const tart = { name: 'la tarte', limit: { daysBefore: 1, time: '18:00' } };

    expect(
      decideDayNotice(input({ held: null, now: tuesdayAt('16:20'), cartLimits: [tart] })),
    ).toEqual({ kind: 'countdown', first: WEDNESDAY, minutesLeft: 100, item: 'la tarte' });
  });

  it('jamais « trop tard » : premier jour après demain, limite de demain lue', () => {
    const notice = decideDayNotice(
      input({
        held: null,
        now: tuesdayAt('23:30'),
        first: THURSDAY,
        firstOrderUntil: '2026-10-21T21:00:00.000Z',
        tomorrowOrderUntil: TUESDAY_23H,
      }),
    );
    expect(notice).toBeNull();
  });

  it('ni opération ni « slipped » sans jour gardé', () => {
    expect(decideDayNotice(input({ held: null, first: THURSDAY, byOperation: true }))).toBeNull();
  });
});

/**
 * 🔴 La limite PROPRE d'un article déjà passée pour le jour dont parle la
 * barre (Hugo, 2026-10-21) : la barre se taisait alors que la passation
 * refuserait.
 */
describe('firstPossibleDay', () => {
  it('la veille à 18 h, passée mardi 19 h : jeudi, pas mercredi', () => {
    expect(firstPossibleDay({ daysBefore: 1, time: '18:00' }, WEDNESDAY, tuesdayAt('19:00'))).toBe(
      THURSDAY,
    );
  });

  it('la veille à 18 h, mardi 17 h : mercredi reste possible', () => {
    expect(firstPossibleDay({ daysBefore: 1, time: '18:00' }, WEDNESDAY, tuesdayAt('17:00'))).toBe(
      WEDNESDAY,
    );
  });

  it('deux jours avant à 12 h, mardi 15 h : vendredi', () => {
    expect(firstPossibleDay({ daysBefore: 2, time: '12:00' }, WEDNESDAY, tuesdayAt('15:00'))).toBe(
      '2026-10-23',
    );
  });

  /** Passage à l'heure d'hiver le dimanche 25 octobre 2026 : Paris = UTC+1 ensuite. */
  it('lit l’heure de Paris après le passage à l’heure d’hiver', () => {
    const eve = { daysBefore: 1, time: '23:00' };
    // Dimanche 25, 22 h 59 Paris (UTC+1) : la limite de lundi n'est pas tombée.
    expect(firstPossibleDay(eve, '2026-10-25', new Date('2026-10-25T21:59:00.000Z'))).toBe(
      '2026-10-26',
    );
    // Dimanche 25, 23 h Paris : elle l'est — mardi.
    expect(firstPossibleDay(eve, '2026-10-25', new Date('2026-10-25T22:00:00.000Z'))).toBe(
      '2026-10-27',
    );
  });
});

describe('decideDayNotice — un article déjà trop tard', () => {
  const TART = { name: 'Tarte myrtille T1', limit: { daysBefore: 3, time: '12:00' } };

  it('l’emporte sur la forme calme : nomme l’article et le jour où il redevient possible', () => {
    expect(decideDayNotice(input({ held: THURSDAY, cartLimits: [TART] }))).toEqual({
      kind: 'itemTooLate',
      day: THURSDAY,
      item: 'Tarte myrtille T1',
      others: 0,
      next: '2026-10-24',
    });
  });

  it('plusieurs articles : le premier nommé, le compte des autres, le jour le plus tardif', () => {
    const eve = { name: 'la bûche', limit: { daysBefore: 1, time: '12:00' } };
    const late = { name: 'le kouglof', limit: { daysBefore: 4, time: '12:00' } };
    expect(decideDayNotice(input({ cartLimits: [eve, TART, late] }))).toEqual({
      kind: 'itemTooLate',
      day: WEDNESDAY,
      item: 'la bûche',
      others: 2,
      next: '2026-10-25',
    });
  });

  it('sans service choisi aussi, sur le premier jour accordé', () => {
    expect(decideDayNotice(input({ held: null, cartLimits: [TART] }))).toMatchObject({
      kind: 'itemTooLate',
      day: WEDNESDAY,
      next: '2026-10-24',
    });
  });

  it('se tait quand l’article est encore possible pour ce jour', () => {
    const notice = decideDayNotice(input({ held: '2026-10-24', cartLimits: [TART] }));
    expect(notice?.kind).not.toBe('itemTooLate');
  });
});

describe('dayNoLongerPossible et offersDayChange', () => {
  const D = '2026-10-22';
  const N = '2026-10-23';

  it('bloque et offre « Modifier » quand le jour choisi a glissé', () => {
    const notice = { kind: 'slipped', held: D, first: N } as const;
    expect(dayNoLongerPossible(notice, D)).toBe(true);
    expect(offersDayChange(notice, D)).toBe(true);
  });

  it('bloque quand un article est trop tard pour le jour CHOISI, pas sans choix', () => {
    const notice = { kind: 'itemTooLate', day: D, item: 'la tarte', others: 0, next: N } as const;
    expect(dayNoLongerPossible(notice, D)).toBe(true);
    expect(dayNoLongerPossible(notice, null)).toBe(false);
    expect(offersDayChange(notice, null)).toBe(false);
  });

  it('offre « Modifier » sans bloquer quand la boutique a décalé le jour', () => {
    const notice = { kind: 'late', held: N, passedAt: null } as const;
    expect(dayNoLongerPossible(notice, N)).toBe(false);
    expect(offersDayChange(notice, N)).toBe(true);
  });

  it('se tait sur un compte à rebours, et sans rien à dire', () => {
    const notice = { kind: 'countdown', first: D, minutesLeft: 30 } as const;
    expect(offersDayChange(notice, D)).toBe(false);
    expect(dayNoLongerPossible(null, D)).toBe(false);
  });
});
