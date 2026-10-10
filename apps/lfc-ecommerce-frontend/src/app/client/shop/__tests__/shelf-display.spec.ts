import { describe, expect, it } from 'vitest';

import type { ShopImageView } from '@lfd/contracts';

import { objectPositionOf } from '../shelf-display';

const PHOTO: ShopImageView = {
  url: 'https://media.lafoliecoffee.info/products/abc.jpg',
  alt: 'Un croissant',
  width: 800,
  height: 600,
};

/**
 * L4 (2026-10-10) : le point focal posé à la médiathèque recadre la vitrine.
 * Sans lui, `object-fit: cover` coupait au centre et pouvait sortir la pièce
 * du champ.
 */
describe('objectPositionOf — recadrer autour du point focal', () => {
  it('place le point focal en pourcentages', () => {
    expect(objectPositionOf({ ...PHOTO, focal: { x: 0.25, y: 0.8 } })).toBe('25% 80%');
  });

  it('recadre au centre quand personne ne s’est prononcé', () => {
    expect(objectPositionOf({ ...PHOTO, focal: null })).toBe('50% 50%');
  });

  it('recadre au centre quand le serveur ne l’envoie pas encore', () => {
    expect(objectPositionOf(PHOTO)).toBe('50% 50%');
  });

  it('arrondit au dixième, sans bruit flottant', () => {
    expect(objectPositionOf({ ...PHOTO, focal: { x: 0.1 + 0.2, y: 1 } })).toBe('30% 100%');
  });
});
