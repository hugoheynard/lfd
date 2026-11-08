import { describe, expect, it } from 'vitest';

import { readSocietyAnswer } from './society-consent-reader';

/**
 * La réponse à la case revient du stockage du navigateur (`appState` d'Auth0) :
 * rien n'y est cru sur parole, et seule la version COURANTE se rejoue.
 */
describe('readSocietyAnswer', () => {
  it('relit une réponse bien formée', () => {
    const answer = { accepted: true, textVersion: 'society.v1', locale: 'en' };

    expect(readSocietyAnswer(answer)).toEqual(answer);
  });

  it.each([
    ['absente', undefined],
    ['sans booléen', { accepted: 'oui', textVersion: 'society.v1', locale: 'fr' }],
    ['d’une autre version', { accepted: true, textVersion: 'society.v0', locale: 'fr' }],
    ['d’une langue inconnue', { accepted: true, textVersion: 'society.v1', locale: 'de' }],
  ])('écarte une réponse %s', (_, value) => {
    expect(readSocietyAnswer(value)).toBeUndefined();
  });
});
