import { describe, expect, it } from 'vitest';

import type { ShopImageView } from '@lfd/contracts';

import { TEST_ITEMS } from '../shop-catalogue.fixture';
import { artOf, objectPositionOf, tileArtOf } from '../shelf-display';

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

/**
 * Pré-audit RGAA 1.3 (2026-10-26) : la médiathèque replie une alternative
 * absente sur l'URL du fichier, et la fiche la faisait lire telle quelle.
 */
describe('artOf / tileArtOf — jamais une URL en alternative', () => {
  const [item] = TEST_ITEMS;
  if (item === undefined) throw new Error('fixture vide');

  it('remplace une URL par le nom de l’article, sur l’ouverture comme sur la vignette', () => {
    const piece = { ...item, image: PHOTO_AS_URL, thumbnail: PHOTO_AS_URL };
    expect(artOf(piece).alt).toBe(item.name);
    expect(tileArtOf(piece).alt).toBe(item.name);
  });

  it('garde une alternative rédigée', () => {
    expect(artOf({ ...item, image: PHOTO }).alt).toBe('Un croissant');
  });
});

const PHOTO_AS_URL: ShopImageView = { ...PHOTO, alt: PHOTO.url };
