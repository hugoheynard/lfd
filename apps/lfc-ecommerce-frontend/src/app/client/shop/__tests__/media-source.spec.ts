import { describe, expect, it } from 'vitest';

import { mediaSrcset, sizedMedia, SHEET_WIDTHS, TILE_WIDTHS } from '../media-source';

const PHOTO = 'https://media.lafoliecoffee.info/products/abc123.jpg';

describe('sizedMedia — demander la taille où on affiche', () => {
  it("demande la largeur au serveur d'images, en format négocié", () => {
    // Mesuré le 2026-09-23 sur la photo de production : 3,64 Mo pour le
    // master, 21,5 ko à 720 px en AVIF. C'est 165 fois moins.
    expect(sizedMedia(PHOTO, 720)).toBe(
      'https://media.lafoliecoffee.info/cdn-cgi/image/width=720,format=auto,fit=scale-down/products/abc123.jpg',
    );
  });

  it("garde l'origine de l'image, et ne la répète pas dans le chemin", () => {
    // Le serveur d'images d'une zone sert les ressources de cette zone : une
    // origine absolue dans le chemin ne ferait que l'allonger.
    const rewritten = sizedMedia(PHOTO, 360);

    expect(rewritten.startsWith('https://media.lafoliecoffee.info/cdn-cgi/image/')).toBe(true);
    expect(rewritten).not.toContain('/https://');
  });
});

describe('sizedMedia — ce qu’il ne touche PAS', () => {
  /**
   * 🔴 Les trois refus sont le vrai risque de cette réécriture. Chacun casse
   * quelque chose de visible s'il saute, et aucun ne se verrait en dev.
   */
  it("laisse un chemin RELATIF intact — c'est une ressource de l'application", () => {
    // L'illustration de secours d'un rayon (`shelfArtOf`) en est une. La faire
    // passer par un serveur d'images la casserait, et la vitrine afficherait
    // un cadre vide là où elle montre une pièce dessinée.
    expect(sizedMedia('products/croissant.svg', 720)).toBe('products/croissant.svg');
    expect(sizedMedia('brand/lfc-mark.png', 720)).toBe('brand/lfc-mark.png');
  });

  it('laisse un SVG intact, même absolu', () => {
    // Un SVG n'a pas de pixels à réduire : le redimensionner ne gagne rien et
    // peut le rasteriser, donc le DÉGRADER.
    const svg = 'https://media.lafoliecoffee.info/products/dessin.svg';

    expect(sizedMedia(svg, 720)).toBe(svg);
  });

  it("laisse `localhost` intact — le fonds de dev n'a pas de serveur d'images", () => {
    // Sans ce refus, tout le développement se ferait sur des 404, et on
    // chercherait un défaut qui n'existe qu'en dev.
    const local = 'http://localhost:9100/lfc-media-dev/products/abc.jpg';

    expect(sizedMedia(local, 720)).toBe(local);
  });
});

describe('mediaSrcset', () => {
  it('annonce chaque largeur avec son descripteur', () => {
    const srcset = mediaSrcset(PHOTO, TILE_WIDTHS);

    expect(srcset).toContain('width=360,');
    expect(srcset).toContain(' 360w');
    expect(srcset).toContain('width=720,');
    expect(srcset).toContain(' 720w');
  });

  it("rend une chaîne VIDE pour ce qui n'est pas redimensionnable", () => {
    // Un `srcset` qui annoncerait plusieurs largeurs du MÊME fichier ferait
    // croire à un choix qui n'existe pas — et ferait télécharger le plus gros
    // pour rien.
    expect(mediaSrcset('products/croissant.svg', TILE_WIDTHS)).toBe('');
  });

  it("double la largeur d'affichage, et pas plus", () => {
    // Un écran à forte densité affiche deux pixels physiques par pixel de mise
    // en page. Au-delà de 2×, chaque pixel est invisible ET payé — c'est toute
    // la règle, et c'est elle qu'on enfreignait de 26 fois.
    expect(TILE_WIDTHS[1]).toBe(TILE_WIDTHS[0] * 2);
    expect(SHEET_WIDTHS[1]).toBe(SHEET_WIDTHS[0] * 2);
  });
});
