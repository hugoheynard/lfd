import { describe, expect, it } from 'vitest';

import { deadlinesOfDay, deliveryWindowOf, weekdayOfIsoDate } from './delivery-window';

/** CA3 et CA1b : une livraison ne part plus sans heure. */
describe('la fenêtre d’une livraison à la passation', () => {
  const base = {
    dayDeadlines: [] as readonly string[],
    bookSlot: null,
    deadline: '',
    slotStart: '',
    slotEnd: '',
  };

  it('en échéance, envoie l’heure choisie SANS début', () => {
    expect(deliveryWindowOf({ ...base, mode: 'deadline', deadline: '06:00' })).toEqual({
      start: null,
      end: '06:00',
    });
  });

  it('en échéance, omet la seule échéance du jour — le serveur la reprend', () => {
    expect(deliveryWindowOf({ ...base, mode: 'deadline', dayDeadlines: ['06:00'] })).toBeNull();
  });

  it('en échéance, exige un choix quand il y en a plusieurs', () => {
    const many = { ...base, mode: 'deadline' as const, dayDeadlines: ['06:00', '11:00'] };
    expect(deliveryWindowOf(many)).toBeUndefined();
  });

  it('en créneau, laisse au serveur celui du carnet', () => {
    const bookSlot = { start: '07:00', end: '08:00' };
    expect(deliveryWindowOf({ ...base, mode: 'slot', bookSlot })).toBeNull();
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
