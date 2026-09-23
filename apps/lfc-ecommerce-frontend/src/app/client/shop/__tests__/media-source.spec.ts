import { describe, expect, it } from 'vitest';

import type { ShopItemView } from '@lfd/contracts';

import { mediaSrcset, sizedMedia, SHEET_WIDTHS, TILE_WIDTHS } from '../media-source';
import { artOf, tileArtOf } from '../shelf-display';

const PHOTO = 'https://media.lafoliecoffee.info/products/abc123.jpg';

describe('sizedMedia — demander la taille où on affiche', () => {
  it("demande la largeur au serveur d'images, en format négocié", () => {
    // Mesuré le 2026-09-23 sur la photo de production : 3,64 Mo pour le
    // master, 21,5 ko à 720 px en AVIF. C'est 165 fois moins.
    expect(sizedMedia(PHOTO, 720)).toBe(
      'https://media.lafoliecoffee.info/cdn-cgi/image/width=720,format=auto,fit=scale-down,onerror=redirect/products/abc123.jpg',
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

describe('sizedMedia — le filet', () => {
  /**
   * 🔴 Vérifié en vrai le 2026-09-23 : sur une image qui échoue, le serveur
   * d'images rend un **307 vers l'original** au lieu d'une erreur.
   *
   * C'est ce qui rend le dispositif sûr à déployer sans avoir levé toutes les
   * questions de quota : si les transformations s'arrêtent, la boutique
   * redevient LOURDE — elle ne casse pas. « Les photos ont disparu » et « les
   * photos pèsent à nouveau 3,64 Mo » ne sont pas la même panne.
   */
  it("demande le repli sur l'ORIGINAL en cas d'échec", () => {
    expect(sizedMedia(PHOTO, 720)).toContain('onerror=redirect');
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

/** Un article de vitrine, réduit à ce que le choix du visuel regarde. */
function piece(over: Partial<ShopItemView> = {}): ShopItemView {
  return {
    sku: 'VIE-001',
    name: 'Croissant',
    note: null,
    image: null,
    thumbnail: null,
    unitPriceMillicents: 140_000,
    unitPriceTtcCents: 148,
    vatRatePercent: 5.5,
    shelfId: 'cat_vien',
    isFeatured: false,
    ...over,
  };
}

const HERO = {
  url: 'https://m.test/hero.jpg',
  alt: 'Croissant de face',
  width: 1800,
  height: 1200,
};
const VIGNETTE = { url: 'https://m.test/vig.jpg', alt: 'Croissant serré', width: 720, height: 540 };

describe('le visuel EN RAYON', () => {
  /**
   * 🔴 Régression attendue du 2026-09-23, et elle était invisible depuis
   * l'écran d'administration : le référentiel proposait un rôle « vignette de
   * rayon (4/3) », on pouvait le choisir, et RIEN ne le transportait. Le fil
   * ne portait qu'une image par produit — le `hero` — et la boutique lisait ce
   * même champ pour la tuile ET pour l'ouverture.
   *
   * Un écran qui offre un geste sans effet apprend à se méfier de lui.
   */
  it('préfère la VIGNETTE quand la fiche en désigne une', () => {
    expect(tileArtOf(piece({ image: HERO, thumbnail: VIGNETTE })).url).toBe(VIGNETTE.url);
  });

  it("retombe sur l'ouverture quand aucune vignette n'est désignée", () => {
    // Le comportement d'hier, et celui de toutes les fiches tant qu'un push
    // v10 n'a pas tourné. Une ouverture recadrée vaut mieux qu'un vide.
    expect(tileArtOf(piece({ image: HERO })).url).toBe(HERO.url);
  });

  it("retombe sur l'illustration du rayon quand la fiche n'a aucune photo", () => {
    expect(tileArtOf(piece()).url).toContain('croissant.svg');
  });

  it('ne remonte JAMAIS la vignette en ouverture de fiche', () => {
    // Le repli va de la vignette VERS l'ouverture, jamais l'inverse : une
    // vignette cadrée serré étirée en 3/2 montrerait un gros plan là où on
    // attend la pièce entière.
    expect(artOf(piece({ thumbnail: VIGNETTE })).url).toContain('croissant.svg');
    expect(artOf(piece({ image: HERO, thumbnail: VIGNETTE })).url).toBe(HERO.url);
  });
});
