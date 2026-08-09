import type { Slot } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { dayLabel, groupSlots, periodOf, soonestLabel } from '../slots-model';

const TODAY = '2026-08-09';
const TOMORROW = '2026-08-10';

function slot(day: string, time: string): Slot {
  return { startAt: `${day}T${time}:00.000Z`, endAt: '', day, time };
}

describe('periodOf', () => {
  it('coupe la journée à midi', () => {
    expect(periodOf('09:30')).toBe('morning');
    expect(periodOf('11:59')).toBe('morning');
    expect(periodOf('12:00')).toBe('afternoon');
    expect(periodOf('17:30')).toBe('afternoon');
  });
});

describe('dayLabel', () => {
  it('préfère les repères qu’on lit sans réfléchir', () => {
    expect(dayLabel(TODAY, TODAY, TOMORROW)).toBe("Aujourd'hui");
    expect(dayLabel(TOMORROW, TODAY, TOMORROW)).toBe('Demain');
  });

  it('écrit les autres jours en toutes lettres, JAMAIS en date brute', () => {
    const label = dayLabel('2026-08-14', TODAY, TOMORROW);
    expect(label).toBe('vendredi 14 août');
    expect(label).not.toMatch(/\d{4}-\d{2}-\d{2}/u);
  });

  it('ne bascule pas de jour à cause du fuseau', () => {
    // Ancrage à midi : lu à minuit, le 1er août deviendrait le 31 juillet.
    expect(dayLabel('2026-08-01', TODAY, TOMORROW)).toContain('1 août');
  });
});

describe('groupSlots', () => {
  const slots = [
    slot(TODAY, '09:00'),
    slot(TODAY, '14:00'),
    slot(TOMORROW, '10:00'),
    slot('2026-08-14', '15:00'),
  ];

  it('regroupe par jour, en gardant l’ordre reçu', () => {
    const days = groupSlots(slots, 'all', TODAY, TOMORROW);
    expect(days.map((day) => day.label)).toEqual(["Aujourd'hui", 'Demain', 'vendredi 14 août']);
    expect(days[0]?.slots).toHaveLength(2);
  });

  it('filtre sur la demi-journée', () => {
    const morning = groupSlots(slots, 'morning', TODAY, TOMORROW);
    expect(morning.flatMap((day) => day.slots).map((s) => s.time)).toEqual(['09:00', '10:00']);
  });

  it('ÉCARTE les jours que le filtre a vidés', () => {
    // Un jour sans une seule heure en dessous fait défiler pour rien.
    const afternoon = groupSlots(slots, 'afternoon', TODAY, TOMORROW);
    expect(afternoon.map((day) => day.day)).toEqual([TODAY, '2026-08-14']);
  });

  it('ne rend rien quand le filtre ne laisse rien', () => {
    expect(groupSlots([slot(TODAY, '09:00')], 'afternoon', TODAY, TOMORROW)).toEqual([]);
  });
});

describe('soonestLabel', () => {
  it('écrit le premier créneau en toutes lettres', () => {
    expect(soonestLabel([slot(TOMORROW, '09:00')], TODAY, TOMORROW)).toBe('demain à 09:00');
    expect(soonestLabel([slot('2026-08-14', '15:00')], TODAY, TOMORROW)).toBe(
      'le vendredi 14 août à 15:00',
    );
  });

  it('ne promet RIEN quand il n’y a rien à promettre', () => {
    expect(soonestLabel([], TODAY, TOMORROW)).toBeNull();
  });
});
