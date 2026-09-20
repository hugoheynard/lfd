/**
 * Une carte du puits « Prêt pour vous ».
 *
 * La réf pose une règle qui a l'air décorative et ne l'est pas : **seules des
 * ACTIONS entrent dans la zone défilante**. Une mention explicative (« compte
 * particulier : pas de facture ») n'en est pas une et vit sous la zone, en
 * ligne à puce — sinon elle remplacerait une carte de 58 px par une de 72 px
 * dans l'état qui compte le MOINS d'actions, et déborderait le plafond de
 * 250 px pile là où il devait tenir.
 */
export interface WellCard {
  readonly id: 'pickup' | 'cart' | 'invoice';
  readonly title: string;
  /** Le glyphe de la tuile. Le panier n'en porte pas : il montre son NOMBRE. */
  readonly icon: 'qr-code' | 'receipt' | '';
  /** Les deux lignes de détail — la seconde est facultative. */
  readonly lines: readonly string[];
  /** Le libellé du bouton : un VERBE, jamais un chevron. */
  readonly action: string;
  /** Où il mène. */
  readonly route: string;
  /** La pastille de condition (« Avant 18 h »), quand il y en a une. */
  readonly badge: string;
  /** La carte principale — celle qui porte la crème pleine. */
  readonly primary: boolean;
}
