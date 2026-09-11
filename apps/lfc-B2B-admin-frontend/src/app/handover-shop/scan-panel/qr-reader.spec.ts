import { describe, expect, it } from 'vitest';

import { tokenOf } from './qr-reader';

/**
 * 🔴 **Ce que ces cas tiennent, c'est le REFUS.**
 *
 * Un scanner lit ce qu'on lui présente : une étiquette de transporteur, un
 * badge, le QR d'un menu. Sans cette porte, le contenu de n'importe lequel
 * partirait dans l'URL d'une requête vers l'API — journalisé au passage. Ce qui
 * n'a pas la forme d'un jeton ne doit jamais atteindre le réseau.
 */
describe('tokenOf', () => {
  it('lit le jeton dans l’URL que le QR encode', () => {
    expect(tokenOf('https://admin.lfc.test/retrait/tok_secret_42')).toBe('tok_secret_42');
  });

  it('accepte un jeton nu, tel qu’un lecteur peut le rendre', () => {
    expect(tokenOf('tok_secret_42')).toBe('tok_secret_42');
  });

  it('ignore les espaces autour — un lecteur en ajoute souvent un', () => {
    expect(tokenOf('  tok_secret_42\n')).toBe('tok_secret_42');
  });

  it('🔴 refuse ce qui n’a pas la forme d’un jeton', () => {
    expect(tokenOf('')).toBeNull();
    expect(tokenOf('   ')).toBeNull();
    // Trop court pour être un secret : c'est un code-barres de caisse.
    expect(tokenOf('12345')).toBeNull();
    // Une URL étrangère, même bien formée.
    expect(tokenOf('https://exemple.test/produit/42')).toBeNull();
    // Du texte libre, ce qu'un QR de menu encode.
    expect(tokenOf('Bienvenue chez nous !')).toBeNull();
  });

  it('🔴 ne prend PAS le chemin d’une autre route qui contiendrait un segment', () => {
    // `/commandes/…` n'est pas `/retrait/…` : rien à en tirer.
    expect(tokenOf('https://admin.lfc.test/commandes/abcdefghij')).toBeNull();
  });
});
