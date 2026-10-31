import type { PromotionEffectKindValue, PromotionScopeTargetValue } from '@lfd/contracts';

import type { DraftFulfillmentKind } from './promotion-draft';

/** Les mots des choix de la page d'une promotion — ce que le client en reçoit. */

export const EFFECT_LABEL: Readonly<Record<PromotionEffectKindValue, string>> = {
  percent_off: 'Pourcentage (%)',
  unit_amount_off: "Montant à l'unité (€ HT)",
  fixed_unit_price: 'Prix posé (€ HT)',
  basket_amount_off: 'Montant sur le panier (€ HT)',
};

/**
 * **Le genre de remise**, choisi en premier (décision de Hugo du 2026-10-31,
 * comme les grandes plateformes : le type d'abord, puis un formulaire qui ne
 * montre que ce qui a du sens). Le libellé nomme le geste ; l'indication dit
 * la conséquence pour le client.
 */
export const FULFILLMENT_OPTIONS: readonly {
  readonly value: DraftFulfillmentKind;
  readonly label: string;
  readonly icon: 'tag' | 'shopping-cart';
  readonly hint: string;
}[] = [
  {
    value: 'displayed_price',
    label: 'Baisser le prix des articles',
    icon: 'tag',
    hint: 'Le prix de l’article baisse au catalogue, pour tous les acheminements : le client voit le prix remisé avant de commander.',
  },
  {
    value: 'basket',
    label: 'Remise sur le panier',
    icon: 'shopping-cart',
    hint: 'Le prix au catalogue ne bouge pas : la remise s’applique au panier, et peut se limiter au retrait, à certains points, à la livraison ou à certaines zones.',
  },
];

export const PICKUP_REACH_OPTIONS = [
  { value: true, label: 'Tous les points' },
  { value: false, label: 'Certains points' },
] as const;

export const DELIVERY_REACH_OPTIONS = [
  { value: true, label: 'Toutes les zones' },
  { value: false, label: 'Certaines zones' },
] as const;

export const TARGET_LABEL: Readonly<Record<PromotionScopeTargetValue, string>> = {
  category: 'Familles',
  product: 'Produits (toutes leurs déclinaisons)',
  variant: 'Déclinaisons',
};

export const SCOPE_OPTIONS = [
  { value: 'all_except' as const, label: 'Tout le catalogue, sauf…' },
  { value: 'only' as const, label: 'Seulement…' },
];
