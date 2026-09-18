import { describe, expect, it } from 'vitest';

import { staffAuthor } from '../staff-author';

/**
 * Le nom quand le serveur en a résolu un, la valeur brute sinon — plan
 * `documentation/staff/plan-l-auteur-est-la-fiche.md`, D3. Le cas qui compte
 * est le premier : un `sub` Auth0 ne doit plus apparaître quand un nom existe.
 */
describe('l’auteur staff affiché', () => {
  it('montre le nom résolu, jamais le sub qu’il remplace', () => {
    expect(staffAuthor('auth0|abc', 'Hugo Heynard')).toBe('Hugo Heynard');
  });

  it('garde un marqueur qui ne désigne personne tel quel', () => {
    expect(staffAuthor('seed-pim', null)).toBe('seed-pim');
  });

  it('rend null quand personne n’a fait le geste', () => {
    expect(staffAuthor(null, null)).toBeNull();
  });
});
