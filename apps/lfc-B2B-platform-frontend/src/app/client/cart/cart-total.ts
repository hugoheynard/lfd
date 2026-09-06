import type { ShopItemView } from '@lfd/contracts';

/**
 * **Ce qu'une ligne de panier EST** — et plus rien de ce qu'elle coûte.
 *
 * Ce module portait le décompte : sous-total, remise, coursier, ventilation de
 * TVA, total TTC. Tout est parti au serveur le 2026-09-06 (`POST /shop/quote`,
 * cf. {@link ShopQuote}), et pour une raison qui tient en une phrase :
 * `architecture-prix-boutique.md` §6 interdisait déjà au front de multiplier.
 *
 * > le front **ne multiplie jamais**. Il demande une route qui résout chaque
 * > ligne à sa quantité réelle.
 *
 * Une multiplication reste exacte tant qu'aucun palier n'existe, et devient
 * fausse **en silence** le jour où un barème ouvert à tous est posé — elle rend
 * encore un nombre plausible. S'y ajoutaient une remise en pourcentage tirée
 * d'une maquette, incapable de dire une remise en montant, et des frais de zone
 * en euros flottants.
 *
 * Ce qui reste est ce qu'un écran a besoin de savoir sans demander : quelle
 * référence, en quelle quantité.
 */

/** Une ligne de panier : une référence du catalogue et sa quantité. */
export interface CartLine {
  readonly product: ShopItemView;
  readonly quantity: number;
}
