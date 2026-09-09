import type { OrderLineView, RejectionCause } from '@lfd/contracts';

import type { PriceChain } from '../../b2b/tarification/pricing-format';

/**
 * **La trace figée d'une ligne, vue comme une chaîne de prix.**
 *
 * 🔴 Ce mapper existe pour qu'on n'ait PAS à fabriquer un faux `PricingItemView`.
 * Un item vivant contrefait aurait marché, et aurait été le pire choix possible :
 * le même écran aurait servi une résolution du jour et une facture de l'an
 * dernier sans qu'on puisse les distinguer. En litige, on défend ce qui a été
 * facturé — pas ce que le moteur ferait aujourd'hui.
 *
 * `null` quand la ligne ne porte **aucune** trace : une commande passée avant
 * qu'elle n'existe. L'écran se tait alors, plutôt que de dessiner une chaîne
 * vide qui affirmerait « aucun étage n'a joué ».
 */
export function frozenChainOf(line: OrderLineView): PriceChain | null {
  const trace = line.pricing;
  if (trace === null) {
    return null;
  }
  return {
    origin: 'frozen',
    subject: line.productName,
    canonicalMillicents: trace.basePriceMillicents,
    steps: trace.steps,
    floored: trace.floored,
    // `null` = on ne sait pas (ligne d'avant la colonne). Ne pas afficher la
    // mention est la seule lecture honnête : `true` affirmerait, et `false`
    // affirmerait aussi.
    clampedToZero: trace.clampedToZero === true,
    // Le prix FACTURÉ, pris sur la ligne et non recalculé depuis la chaîne :
    // c'est lui qui fait foi, et un écart entre les deux serait précisément ce
    // qu'on veut voir plutôt que masquer.
    finalMillicents: line.unitPriceMillicents,
    floorMillicents: trace.floorDecision?.floorMillicents ?? null,
    // Une décision de plancher figée ne porte pas sa portée : le tronçon
    // s'intitulera « Limite », sans prétendre en connaître le périmètre.
    floorScope: null,
    // 🔴 Toujours `null` : la marge de négociation est une notion **du jour**.
    // Sur une commande close, il n'y a plus rien à lâcher.
    room: null,
  };
}

/**
 * Pourquoi une règle n'a rien produit, **en français**.
 *
 * Les libellés parlent du moment de la commande, pas d'aujourd'hui : « expirée
 * **à cette date** ». Une règle expirée depuis peut très bien avoir été en
 * vigueur ce jour-là, et l'inverse aussi.
 */
export const REJECTION_LABELS: Readonly<Record<RejectionCause, string>> = {
  expired: 'hors de sa période à cette date',
  suspended: 'suspendue à cette date',
  out_of_scope: 'ne visait pas cet article',
  out_of_audience: 'ne visait pas ce client',
  below_threshold: 'seuil de quantité non atteint',
  superseded: 'supplantée par une règle plus précise',
  sealed: 'écartée par le tarif négocié',
};
