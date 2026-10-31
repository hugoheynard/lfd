import type {
  PromotionEffectKindValue,
  PromotionFulfillmentKindValue,
  PromotionScopeTargetValue,
} from '@lfd/contracts';

/** Les mots des choix de la page d'une promotion — ce que le client en reçoit. */

export const EFFECT_LABEL: Readonly<Record<PromotionEffectKindValue, string>> = {
  percent_off: 'Pourcentage (%)',
  unit_amount_off: "Montant à l'unité (€ HT)",
  fixed_unit_price: 'Prix posé (€ HT)',
  basket_amount_off: 'Montant sur le panier (€ HT)',
};

export const FULFILLMENT_LABEL: Readonly<Record<PromotionFulfillmentKindValue, string>> = {
  any: 'Quel que soit l’acheminement',
  pickup: 'Au retrait, à tous les points',
  pickup_point: 'Au retrait, à un point',
  delivery: 'En livraison',
};

/** La conséquence, dite au client : le prix affiché, ou la remise au panier. */
export const FULFILLMENT_HINT: Readonly<Record<PromotionFulfillmentKindValue, string>> = {
  any: 'Le prix baisse au catalogue : le client voit le prix remisé avant de commander, sur chaque ligne.',
  pickup:
    'Le prix au catalogue ne bouge pas : la remise s’applique au panier quand le client choisit le retrait.',
  pickup_point:
    'Le prix au catalogue ne bouge pas : la remise s’applique au panier quand le client choisit ce point.',
  delivery:
    'Le prix au catalogue ne bouge pas : la remise s’applique au panier quand le client choisit la livraison.',
};

export const TARGET_LABEL: Readonly<Record<PromotionScopeTargetValue, string>> = {
  category: 'Familles',
  product: 'Produits (toutes leurs déclinaisons)',
  variant: 'Déclinaisons',
};

export const SCOPE_OPTIONS = [
  { value: 'all_except' as const, label: 'Tout le catalogue, sauf des exceptions' },
  { value: 'only' as const, label: 'Seulement une sélection' },
];
