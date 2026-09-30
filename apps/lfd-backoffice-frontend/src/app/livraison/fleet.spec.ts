import type { DeparturePointView, VehicleView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { activeCountLabel, pointAddressLine, retiredOnLabel, splitFleet } from './fleet';

function vehicle(id: string, retiredAt: string | null = null): VehicleView {
  return {
    id,
    name: `Véhicule ${id}`,
    plate: `AB-${id}-CD`,
    retiredAt,
    createdAt: '2026-01-01T08:00:00.000Z',
    cargo: null,
    wheelArches: null,
    refrigeration: null,
    energy: null,
  };
}

describe('splitFleet', () => {
  it('garde les actifs dans l’ordre du serveur', () => {
    const fleet = splitFleet([
      vehicle('1'),
      vehicle('2', '2026-03-01T10:00:00.000Z'),
      vehicle('3'),
    ]);
    expect(fleet.active.map((v) => v.id)).toEqual(['1', '3']);
  });

  it('range les retirés du plus récent au plus ancien', () => {
    // Dates comparées entre elles seulement : aucune horloge n'entre en jeu.
    const fleet = splitFleet([
      vehicle('a', '2026-01-10T10:00:00.000Z'),
      vehicle('b', '2026-05-10T10:00:00.000Z'),
      vehicle('c', '2026-03-10T10:00:00.000Z'),
    ]);
    expect(fleet.retired.map((v) => v.id)).toEqual(['b', 'c', 'a']);
    expect(fleet.active).toEqual([]);
  });
});

describe('retiredOnLabel', () => {
  it('dit le jour à Paris, pas en UTC', () => {
    // 23 h 30 UTC le 14 = 01 h 30 à Paris le 15 (heure d'été).
    expect(retiredOnLabel('2026-07-14T23:30:00.000Z')).toBe('retiré le 15 juillet 2026');
  });
});

describe('activeCountLabel', () => {
  it('accorde le nombre', () => {
    expect(activeCountLabel(0)).toBe('0 véhicules actifs');
    expect(activeCountLabel(1)).toBe('1 véhicule actif');
    expect(activeCountLabel(3)).toBe('3 véhicules actifs');
  });
});

describe('pointAddressLine', () => {
  const point = (ligne2: string): DeparturePointView => ({
    pickupAddressId: 'pa_1',
    label: 'Labo',
    address: {
      label: 'Labo',
      ligne1: '12 rue du Four',
      ligne2,
      codePostal: '75011',
      ville: 'Paris',
      pays: 'FR',
    },
    gps: null,
  });

  it('met l’adresse sur une ligne, sans complément vide', () => {
    expect(pointAddressLine(point(''))).toBe('12 rue du Four, 75011 Paris');
    expect(pointAddressLine(point('Bât. B'))).toBe('12 rue du Four, Bât. B, 75011 Paris');
  });
});
