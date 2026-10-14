import { describe, expect, it } from 'vitest';

import type { DeliveryAddressView } from '@lfd/contracts';

import {
  bookSlotsOfDay,
  deadlinesOfDay,
  deliveryWindowOf,
  weekdayOfIsoDate,
} from './delivery-window';

/** CA3 et CA1b : une livraison ne part plus sans heure. */
describe('la fenêtre d’une livraison à la passation', () => {
  const base = {
    daySlots: [] as readonly { start: string; end: string }[],
    deadline: '',
    slot: '',
    slotStart: '',
    slotEnd: '',
  };

  it('en échéance, envoie l’heure choisie SANS début', () => {
    expect(deliveryWindowOf({ ...base, mode: 'deadline', deadline: '06:00' })).toEqual({
      start: null,
      end: '06:00',
    });
  });

  /** Hugo, 2026-10-14 : la seule échéance du jour était reprise en silence par le serveur. */
  it('🔴 en échéance, exige un choix même quand le jour n’en a qu’une', () => {
    expect(deliveryWindowOf({ ...base, mode: 'deadline' })).toBeUndefined();
  });

  /** Même décision : le seul créneau du carnet ne part plus « par défaut ». */
  it('🔴 en créneau, exige le choix du SEUL créneau du carnet', () => {
    const daySlots = [{ start: '07:00', end: '08:00' }];
    expect(deliveryWindowOf({ ...base, mode: 'slot', daySlots })).toBeUndefined();
    expect(deliveryWindowOf({ ...base, mode: 'slot', daySlots, slot: '07:00-08:00' })).toEqual({
      start: '07:00',
      end: '08:00',
    });
  });

  it('en créneau, exige un choix quand le carnet en porte plusieurs (CA3b)', () => {
    const daySlots = [
      { start: '07:00', end: '08:00' },
      { start: '18:00', end: '19:00' },
    ];
    expect(deliveryWindowOf({ ...base, mode: 'slot', daySlots })).toBeUndefined();
    expect(deliveryWindowOf({ ...base, mode: 'slot', daySlots, slot: '18:00-19:00' })).toEqual({
      start: '18:00',
      end: '19:00',
    });
  });

  it('lit la liste de créneaux du carnet', () => {
    const view = (specs: Partial<DeliveryAddressView['specs']>): DeliveryAddressView =>
      ({ specs: { slotList: { mode: 'everyday', slots: [] }, ...specs } }) as DeliveryAddressView;
    const evening = { start: '18:00', end: '19:00' };
    expect(
      bookSlotsOfDay(view({ slotList: { mode: 'everyday', slots: [evening] } }), 'mon'),
    ).toEqual([evening]);
    expect(
      bookSlotsOfDay(
        view({
          slotList: { mode: 'everyday', slots: [{ start: '07:00', end: '08:00' }, evening] },
        }),
        'mon',
      ),
    ).toHaveLength(2);
  });

  it('🔴 en créneau sans carnet, ne part pas sans un créneau complet', () => {
    expect(deliveryWindowOf({ ...base, mode: 'slot', slotStart: '07:00' })).toBeUndefined();
    expect(
      deliveryWindowOf({ ...base, mode: 'slot', slotStart: '07:00', slotEnd: '08:00' }),
    ).toEqual({ start: '07:00', end: '08:00' });
  });

  it('lit le jour d’une date nue et ses échéances', () => {
    expect(weekdayOfIsoDate('2026-10-05')).toBe('mon');
    expect(
      deadlinesOfDay(
        {
          mode: 'perDay',
          byDay: {
            mon: ['06:00'],
            tue: null,
            wed: null,
            thu: null,
            fri: null,
            sat: null,
            sun: null,
          },
        },
        'mon',
      ),
    ).toEqual(['06:00']);
  });
});
