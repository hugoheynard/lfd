/**
 * Les deux taux que la boutique distingue à l'écran.
 *
 * ⚠️ **Ce ne sont PAS des taux de facturation.** Le taux qui facture arrive avec
 * chaque article, résolu par le référentiel : `ShopItemView.vatRatePercent`.
 * Ceux-ci ne servent qu'à choisir la LÉGENDE d'une ligne de décompte — « sur
 * le salé » ou « sur le sucré » —, et une comparaison à côté n'affiche qu'un
 * mauvais libellé, jamais un mauvais montant.
 *
 * Ils restent en dur parce qu'ils sont une convention de VITRINE, pas une
 * donnée : le jour où le référentiel porte un troisième régime, c'est la
 * légende qu'il faudra revoir, pas un chiffre à aller chercher.
 */

/** Le taux du salé et du traiteur. */
export const VAT_SALE = 10;
