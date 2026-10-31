import { describe, expect, it } from 'vitest';

import { hoursPhrase, NO_HOURS, weekdaysPhrase } from '../promotion-hours';

describe('la phrase des jours et heures', () => {
  it('« le mardi et le jeudi de 17 h à 19 h, à la commande »', () => {
    expect(
      hoursPhrase({
        ...NO_HOURS,
        on: true,
        windows: [{ weekdays: ['thu', 'tue'], start: '17:00', end: '19:00' }],
      }),
    ).toBe('le mardi et le jeudi de 17 h à 19 h, à la commande');
  });

  it('dit minuit, la semaine ouvrée et le créneau', () => {
    expect(
      hoursPhrase({
        ...NO_HOURS,
        on: true,
        moment: 'handover_at',
        windows: [{ weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'], start: '20:30', end: '24:00' }],
      }),
    ).toBe('du lundi au vendredi de 20 h 30 à minuit, au créneau de retrait ou de livraison');
  });

  it('se tait sans condition, et dit « tous les jours »', () => {
    expect(hoursPhrase(NO_HOURS)).toBeNull();
    expect(weekdaysPhrase(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])).toBe(
      'tous les jours',
    );
  });
});
