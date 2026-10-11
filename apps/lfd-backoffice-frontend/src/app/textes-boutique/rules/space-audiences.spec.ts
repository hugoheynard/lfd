import { describe, expect, it } from 'vitest';

import { audiencesOf, isSeenBy, isUnshown, SPACE_AUDIENCES } from './space-audiences';
import { SHOP_COPY_SPACES } from './shop-copy-spaces';

describe('SPACE_AUDIENCES — qui voit quel espace', () => {
  it('chaque espace du recueil a sa ligne : une clientèle au moins, ou « pas montré » dit', () => {
    const missing = SHOP_COPY_SPACES.map((space) => space.space).filter(
      (space) => !Object.hasOwn(SPACE_AUDIENCES, space),
    );
    // Un espace neuf sans ligne ici serait rangé « pas montré » sans que personne l'ait décidé.
    expect(missing, `espaces sans clientèle déclarée : ${missing.join(', ')}`).toEqual([]);
  });

  it('ne déclare aucun espace que le recueil ne connaît pas', () => {
    const known = new Set(SHOP_COPY_SPACES.map((space) => space.space));
    expect(Object.keys(SPACE_AUDIENCES).filter((space) => !known.has(space))).toEqual([]);
  });

  it('un espace commun paraît chez les trois ; un espace d’une clientèle, chez elle seule', () => {
    expect(audiencesOf('cart')).toEqual(['visitor', 'personal', 'pro']);
    expect(isSeenBy('loyalty', 'personal')).toBe(true);
    expect(isSeenBy('loyalty', 'pro')).toBe(false);
    expect(isSeenBy('account', 'pro')).toBe(true);
    expect(isSeenBy('signup', 'personal')).toBe(false);
  });

  it('ce que personne ne voit, ou qu’on ne connaît pas, est « pas montré »', () => {
    expect(isUnshown('slotStep')).toBe(true);
    expect(isUnshown('mystery')).toBe(true);
    expect(isUnshown('cart')).toBe(false);
  });
});
