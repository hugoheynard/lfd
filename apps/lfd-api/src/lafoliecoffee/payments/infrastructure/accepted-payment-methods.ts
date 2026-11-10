/**
 * Les moyens de paiement que la boutique accepte : **la carte, et elle seule**
 * (Hugo, 2026-10-09 : « klarna et tout ça peut dégager » ; Apple Pay et
 * Google Pay restent).
 *
 * Apple Pay n'est pas un moyen à part chez Stripe : c'est un portefeuille de
 * la carte, qui s'affiche avec elle quand le domaine est enregistré chez Stripe
 * (Paramètres › Domaines des moyens de paiement) et que l'appareil le permet.
 * Énumérer `card` plutôt que laisser Stripe choisir (`automatic_payment_methods`)
 * retire Klarna, Link et tout moyen activé plus tard dans le tableau de bord
 * sans qu'on l'ait décidé ici. Google Pay, autre portefeuille de la carte,
 * reste (Hugo, 2026-10-09 : « google pay aussi c'est bon »).
 */
export const ACCEPTED_PAYMENT_METHOD_TYPES = ["card"] as const;
