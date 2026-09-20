import type { ParamMap } from '@angular/router';

/**
 * **Revenir au panier** après avoir changé le mode ou l'heure.
 *
 * Le panier et l'écran de commande se parlent par l'URL, pas par un état
 * partagé : un rechargement au milieu du choix garde ainsi sa destination, et
 * une valeur inconnue retombe sur le chemin ordinaire — le rayon.
 */
export const RETURN_TO_CART = { retour: 'panier' } as const;

/** Vrai seulement pour la valeur exacte : l'URL se tape à la main. */
export function returnsToCart(query: ParamMap): boolean {
  return query.get('retour') === RETURN_TO_CART.retour;
}
