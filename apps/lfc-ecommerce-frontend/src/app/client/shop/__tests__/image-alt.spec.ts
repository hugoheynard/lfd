import { describe, expect, it } from 'vitest';

import { DECORATIVE_ALT, imageAlt, isMeaningfulAlt } from '../image-alt';

/**
 * Pré-audit RGAA 1.3 (2026-10-26) : la médiathèque replie une alternative
 * absente sur l'URL du fichier, et 58 images sur 89 de la boutique faisaient
 * lire une URL au lecteur d'écran.
 */
describe('imageAlt — une alternative qui décrit, jamais une adresse', () => {
  it('garde une alternative rédigée, sans ses blancs de bord', () => {
    expect(imageAlt('  Un croissant doré  ', 'Croissant')).toBe('Un croissant doré');
  });

  it('garde une phrase qui contient une barre oblique', () => {
    expect(imageAlt('Pain 1/2 complet', 'Pain')).toBe('Pain 1/2 complet');
  });

  it.each([
    ['une URL https', 'https://media.lafoliecoffee.info/products/abc.jpg'],
    ['une URL http', 'http://example.com/x'],
    ['une URL sans schéma', '//cdn.example.com/x.png'],
    ['une URL data', 'data:image/png;base64,AAAA'],
    ['une URL blob', 'blob:https://shop/1234'],
    ['un nom de fichier', 'IMG_0042.JPG'],
    ['un nom de fichier avec espaces', 'photo croissant.webp'],
    ['un chemin', 'products/croissant'],
    ['une chaîne vide', ''],
    ['des blancs', '   '],
  ])('refuse %s et se replie sur le nom du produit', (_, alt) => {
    expect(imageAlt(alt, 'Croissant')).toBe('Croissant');
  });

  it('se replie sur le nom quand la médiathèque n’en a pas', () => {
    expect(imageAlt(null, 'Croissant')).toBe('Croissant');
    expect(imageAlt(undefined, 'Croissant')).toBe('Croissant');
  });

  it('se replie sur une image décorative quand l’appelant le demande', () => {
    expect(imageAlt('https://media/x.jpg', DECORATIVE_ALT)).toBe('');
    expect(DECORATIVE_ALT).toBe('');
  });
});

describe('isMeaningfulAlt', () => {
  it('dit vrai pour un texte, faux pour une URL ou rien', () => {
    expect(isMeaningfulAlt('Une baguette')).toBe(true);
    expect(isMeaningfulAlt('https://x/y.png')).toBe(false);
    expect(isMeaningfulAlt(null)).toBe(false);
  });
});
