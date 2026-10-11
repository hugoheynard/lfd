import { overlayCopy } from '../../../src/app/client/copy/shop-copy-overlay';
import { CopyMarkers } from './copy-markers';

describe('les marqueurs de clé des textes', () => {
  it('marque chaque chaîne d’un dictionnaire, et relit la clé depuis le texte rendu', () => {
    const markers = new CopyMarkers();
    const dictionary = { cart: { whoTitle: 'Qui commande ?', lines: ['un', 'deux'] }, count: 3 };

    const marked = overlayCopy(dictionary, markers.markAll(dictionary));

    expect(marked.count).toBe(3);
    expect(markers.keyAt(marked.cart.whoTitle, 0)).toBe('cart.whoTitle');
    expect(markers.keyAt(marked.cart.lines[1] ?? '', 0)).toBe('cart.lines.1');
  });

  it('ne change pas ce qu’on lit : le marqueur est invisible et sans coupure', () => {
    const markers = new CopyMarkers();
    const marked = markers.markerOf('cart.whoTitle') + 'Qui commande ?';

    expect(marked.replace(/[⁡-⁤]/gu, '')).toBe('Qui commande ?');
    // Ni espace ni U+200B : le marqueur n'ouvre aucune coupure de ligne.
    expect(markers.markerOf('cart.whoTitle')).not.toMatch(/[\s\u200b]/u);
  });

  it('désigne la phrase cliquée dans un texte qui en assemble plusieurs', () => {
    const markers = new CopyMarkers();
    const text = `${markers.markerOf('a.first')}Bonjour ${markers.markerOf('a.second')}Camille`;

    expect(markers.keyAt(text, text.indexOf('Bonjour') + 2)).toBe('a.first');
    expect(markers.keyAt(text, text.indexOf('Camille') + 2)).toBe('a.second');
  });

  it('ne rend aucune clé pour un texte que l’aperçu n’a pas marqué', () => {
    expect(new CopyMarkers().keyAt('Texte en dur', 3)).toBeNull();
  });
});
