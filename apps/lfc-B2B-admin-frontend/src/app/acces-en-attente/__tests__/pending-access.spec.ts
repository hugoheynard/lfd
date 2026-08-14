import { describe, expect, it } from 'vitest';

import { displayName, waitingFor, type PendingAccess } from '../pending-access.model';

const NOW = new Date('2026-08-14T09:00:00.000Z');

function person(over: Partial<PendingAccess> = {}): PendingAccess {
  return {
    userId: 'usr_1',
    email: 'lea@comptoir.fr',
    firstName: 'Léa',
    lastName: 'Martin',
    companyId: 'cmp_1',
    companyName: 'Le Comptoir',
    invitedAt: '2026-08-02T09:00:00.000Z',
    ...over,
  };
}

describe('la file des accès à remettre', () => {
  it('nomme la personne, ou son adresse à défaut', () => {
    // Une ligne sans nom ne se remet à personne : l'adresse est la clé humaine,
    // et c'est elle qu'on dictera au téléphone.
    expect(displayName(person())).toBe('Léa Martin');
    expect(displayName(person({ firstName: '', lastName: '' }))).toBe('lea@comptoir.fr');
  });

  it('dit depuis combien de temps ça attend', () => {
    // C'est l'ancienneté qui fait agir, pas la ligne.
    expect(waitingFor('2026-08-02T09:00:00.000Z', NOW)).toBe('depuis 12 jours');
    expect(waitingFor('2026-08-13T09:00:00.000Z', NOW)).toBe('depuis hier');
    expect(waitingFor('2026-08-14T08:00:00.000Z', NOW)).toBe("depuis aujourd'hui");
  });
});
