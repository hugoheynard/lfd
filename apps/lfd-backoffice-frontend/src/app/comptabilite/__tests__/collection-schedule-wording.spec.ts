import { describe, expect, it } from 'vitest';

import {
  collectionSteps,
  daysExample,
  daysTooShort,
  delayExample,
  depositExample,
} from '../collection-schedule-wording';

const NEXT = {
  closesAt: '2026-10-31T23:00:00.000Z',
  plannedConstitutionAt: '2026-11-01T00:00:00.000Z',
  collectionDay: '2026-11-16',
  depositDeadline: null,
};

describe('les mots du calendrier de prélèvement', () => {
  it('la frise suit l’ordre des choses, et dit « à renseigner » sans limite de dépôt', () => {
    const steps = collectionSteps(NEXT);
    expect(steps.map((step) => step.key)).toEqual(['closes', 'prepared', 'deposit', 'collected']);
    expect(steps[2]?.displayDate).toBe('à renseigner');
    expect(steps[3]?.displayDate).toBe('16 nov. 2026');
  });

  it('la limite de dépôt rendue par le serveur s’affiche telle quelle', () => {
    const steps = collectionSteps({
      ...NEXT,
      depositDeadline: { day: '2026-11-12', time: '16:00' },
    });
    expect(steps[2]?.displayDate).toBe('avant le 12 nov. 2026 à 16:00');
  });

  it('le délai de préparation en heures', () => {
    expect(delayExample(1)).toContain('le 1er à 01h00');
    expect(delayExample(null)).toBe('Indiquez un nombre d’heures.');
  });

  it('la clôture + N jours, vide = le délai d’avis, et au-delà du 28 on parle en jours', () => {
    expect(daysExample(9, 14)).toContain('clôture le 1er + 9 jours → prélèvement le 10');
    expect(daysExample(null, 14)).toContain('Laissé vide : 14 jours');
    expect(daysExample(null, 14)).toContain('prélèvement le 15');
    expect(daysExample(40, 14)).toContain('prélèvement 40 jours après le 1er');
  });

  it('un délai plus court que l’avis est signalé, vide ne l’est pas', () => {
    expect(daysTooShort(9, 14)).toBe(true);
    expect(daysTooShort(14, 14)).toBe(false);
    expect(daysTooShort(null, 14)).toBe(false);
  });

  it('la limite de dépôt : absente, à moitié, complète', () => {
    expect(depositExample(null, '')).toContain('Pas encore renseignée');
    expect(depositExample(2, '')).toContain('ET l’heure');
    expect(depositExample(2, '16:00')).toContain(
      '2 jours ouvrés bancaires avant le prélèvement, avant 16:00',
    );
    expect(depositExample(1, '16:00')).toContain('1 jour ouvré bancaire avant');
  });
});
