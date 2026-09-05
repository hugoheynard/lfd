import { strikedPriceOf } from '../cart-row/striked-price';

/**
 * ⚠️ `Intl` colle un **espace insécable** (U+00A0) avant le symbole, pas une
 * espace ordinaire. Écrit en clair, le test échouait sur deux chaînes que rien
 * ne distingue à l'œil dans le rapport.
 */
const EUR = '\u00a0€';

/** 2,10 € en millicentimes — le tarif d'entrée d'une ligne. */
const ENTREE = 210_000;
/** 1,80 € — ce qu'une mercuriale en a fait. */
const FACTURE = 180_000;

describe('strikedPriceOf', () => {
  /**
   * 🔴 **Régression : l'unité.** La fonction vivait dans le composant, l'entrée
   * s'appelait `…Cents` et se formatait en centimes alors que l'appelant passe
   * des millicentimes. 2,10 € s'affichait « 2 100,00 € ».
   */
  it('formate le tarif d’entrée en millicentimes, pas en centimes', () => {
    expect(strikedPriceOf(ENTREE, FACTURE)).toBe(`2,10${EUR}`);
  });

  /** Rien à barrer quand aucune règle n'a bougé le prix : c'est le cas ordinaire. */
  it('ne rend rien quand le tarif d’entrée est celui qui est facturé', () => {
    expect(strikedPriceOf(ENTREE, ENTREE)).toBeNull();
  });

  it('ne rend rien quand il n’y a pas de tarif d’entrée', () => {
    expect(strikedPriceOf(null, FACTURE)).toBeNull();
  });

  /** Un tarif d'entrée PLUS BAS se barre aussi : la ligne dit ce qui a bougé. */
  it('barre aussi une hausse, pas seulement une remise', () => {
    expect(strikedPriceOf(FACTURE, ENTREE)).toBe(`1,80${EUR}`);
  });

  /** Les décimales du millicentime ne se perdent pas en route. */
  it('garde la fraction de centime d’un prix dérivé', () => {
    expect(strikedPriceOf(210_345, FACTURE)).toBe(`2,10345${EUR}`);
  });
});
